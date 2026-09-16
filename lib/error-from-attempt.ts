import { supabaseServer } from "./supabase-server"
import { loadMappings, isSubjectLevelMapping } from "./tec-mapping"
import { enqueueJob } from "./ai/jobs/queue"
import { runJobWorker } from "./ai/jobs/worker"
import { scheduleQuestionAiKick } from "./ai/jobs/kick"
import { getSimuladoCespeCategoryId } from "./error-categories"

function stripHtml(s: string) {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function norm(s: string) {
  return (s ?? "").trim()
}

async function ensureFallbackTopic(userId: string): Promise<string | null> {
  const subjectName = "Revisão automática"
  const { data: existingSubject } = await supabaseServer
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", subjectName)
    .maybeSingle()

  let subjectId = existingSubject?.id as string | undefined
  if (!subjectId) {
    const { data: created } = await supabaseServer
      .from("subjects")
      .insert({ user_id: userId, name: subjectName })
      .select("id")
      .single()
    subjectId = created?.id
  }
  if (!subjectId) return null
  return getOrCreateTopic(userId, subjectId, "Geral")
}

async function resolveTopicId(params: {
  userId: string
  tecSubject: string | null
  tecTopic: string | null
  notebookId?: string | null
}): Promise<string | null> {
  const mappings = await loadMappings(params.userId)
  const tecSubject = norm(params.tecSubject ?? "")
  const tecTopic = norm(params.tecTopic ?? "")

  if (tecSubject && tecTopic) {
    const exact = mappings.find(
      (m) =>
        norm(m.tec_subject) === tecSubject &&
        norm(m.tec_topic) === tecTopic &&
        m.topic_id
    )
    if (exact?.topic_id) return exact.topic_id
  }

  if (tecSubject) {
    const topicLevel = mappings.find(
      (m) =>
        norm(m.tec_subject) === tecSubject &&
        !isSubjectLevelMapping(m.tec_topic) &&
        m.topic_id
    )
    if (topicLevel?.topic_id) return topicLevel.topic_id

    const subjectMap = mappings.find(
      (m) =>
        isSubjectLevelMapping(m.tec_topic) &&
        norm(m.tec_subject) === tecSubject &&
        m.subject_id
    )
    if (subjectMap?.subject_id) {
      const topicId = await getOrCreateTopic(
        params.userId,
        subjectMap.subject_id,
        tecTopic || tecSubject || "Geral"
      )
      if (topicId) return topicId
    }
  }

  if (params.notebookId) {
    const { data: nb } = await supabaseServer
      .from("notebooks")
      .select("subject_id")
      .eq("id", params.notebookId)
      .maybeSingle()
    if (nb?.subject_id) {
      const tid = await getOrCreateTopic(
        params.userId,
        nb.subject_id,
        tecTopic || tecSubject || "Geral"
      )
      if (tid) return tid
    }
  }

  return ensureFallbackTopic(params.userId)
}

async function getOrCreateTopic(
  userId: string,
  subjectId: string,
  name: string
): Promise<string | null> {
  const topicName = (name || "Geral").slice(0, 120)
  const { data: existing } = await supabaseServer
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .ilike("name", topicName)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await supabaseServer
    .from("topics")
    .insert({ user_id: userId, subject_id: subjectId, name: topicName })
    .select("id")
    .single()

  if (error) {
    const { data: fallback } = await supabaseServer
      .from("topics")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    return fallback?.id ?? null
  }

  return created?.id ?? null
}

export type UpsertErrorFromWrongAttemptResult = {
  errorId: string
  created: boolean
  recurrenceCount: number
}

/**
 * Todo attempt incorreto → registro permanente em `errors`.
 * `motivo` permanece null (só o aluno preenche).
 */
export async function upsertErrorFromWrongAttempt(params: {
  userId: string
  questionId: string
  attemptId: string
  selectedAnswer: string
  notebookId?: string | null
}): Promise<UpsertErrorFromWrongAttemptResult | null> {
  const { data: question } = await supabaseServer
    .from("questions")
    .select(
      "id, statement, correct_answer, tec_url, tec_subject, tec_topic, type"
    )
    .eq("id", params.questionId)
    .maybeSingle()

  if (!question) return null

  const topicId = await resolveTopicId({
    userId: params.userId,
    tecSubject: question.tec_subject,
    tecTopic: question.tec_topic,
    notebookId: params.notebookId,
  })

  if (!topicId) {
    console.warn(
      "[error-from-attempt] sem topic_id — erro não persistido no mapa",
      params.questionId
    )
    return null
  }

  const { data: existing } = await supabaseServer
    .from("errors")
    .select("id, recurrence_count, motivo, active_flashcard_id")
    .eq("user_id", params.userId)
    .eq("source_question_id", params.questionId)
    .maybeSingle()

  const statement = stripHtml(question.statement ?? "").slice(0, 2000)
  const correct = String(question.correct_answer ?? "")
  const selected = String(params.selectedAnswer ?? "")

  let simuladoCategoryId: string | null = null
  try {
    simuladoCategoryId = await getSimuladoCespeCategoryId(params.userId)
  } catch (e) {
    console.warn(
      "[error-from-attempt] categoria Simulado Cespe indisponível (rode sql-error-categories.sql?)",
      e instanceof Error ? e.message : e
    )
  }

  if (existing?.id) {
    const nextCount = Math.max(1, Number(existing.recurrence_count ?? 1) + 1)
    const patch: Record<string, unknown> = {
      source_attempt_id: params.attemptId,
      selected_answer: selected,
      correct_answer: correct,
      recurrence_count: nextCount,
      learning_status: "em_revisao",
      error_status: nextCount > 1 ? "reincidente" : "normal",
    }
    const { error } = await supabaseServer
      .from("errors")
      .update(patch)
      .eq("id", existing.id)

    if (error) throw new Error(error.message)
    return {
      errorId: existing.id,
      created: false,
      recurrenceCount: nextCount,
    }
  }

  const row: Record<string, unknown> = {
    user_id: params.userId,
    topic_id: topicId,
    error_text: `Errei: marquei "${selected}" (gabarito: ${correct}).`,
    correction_text: `Gabarito: ${correct}`,
    description: statement.slice(0, 500),
    reference_link: question.tec_url ?? null,
    error_type: null,
    error_status: "normal",
    source_question_id: params.questionId,
    source_attempt_id: params.attemptId,
    selected_answer: selected,
    correct_answer: correct,
    explanation: null,
    motivo: null,
    recurrence_count: 1,
    learning_status: "novo_erro",
  }
  if (simuladoCategoryId) row.category_id = simuladoCategoryId

  let { data: inserted, error } = await supabaseServer
    .from("errors")
    .insert(row)
    .select("id")
    .single()

  // Schema antigo / colunas ainda não migradas → tenta insert mínimo
  if (
    error &&
    /column|schema|category_id|source_question|learning_status|recurrence/i.test(
      error.message
    )
  ) {
    console.warn(
      "[error-from-attempt] insert completo falhou, tentando campos básicos:",
      error.message
    )
    const retry = await supabaseServer
      .from("errors")
      .insert({
        user_id: params.userId,
        topic_id: topicId,
        error_text: row.error_text,
        correction_text: row.correction_text,
        description: row.description,
        reference_link: row.reference_link,
        error_status: "normal",
      })
      .select("id")
      .single()
    inserted = retry.data
    error = retry.error
  }

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: raced } = await supabaseServer
        .from("errors")
        .select("id, recurrence_count")
        .eq("user_id", params.userId)
        .eq("source_question_id", params.questionId)
        .maybeSingle()
      if (raced?.id) {
        const nextCount = Math.max(1, Number(raced.recurrence_count ?? 1) + 1)
        await supabaseServer
          .from("errors")
          .update({
            source_attempt_id: params.attemptId,
            selected_answer: selected,
            correct_answer: correct,
            recurrence_count: nextCount,
            learning_status: "em_revisao",
            error_status: "reincidente",
          })
          .eq("id", raced.id)
        return {
          errorId: raced.id,
          created: false,
          recurrenceCount: nextCount,
        }
      }
    }
    throw new Error(error.message)
  }

  return {
    errorId: inserted!.id as string,
    created: true,
    recurrenceCount: 1,
  }
}

/** Upsert no caderno + gera C/E (job + processamento imediato). */
export async function onWrongAttemptForErrorReview(params: {
  userId: string
  questionId: string
  attemptId: string
  selectedAnswer: string
  notebookId?: string | null
}) {
  const upserted = await upsertErrorFromWrongAttempt(params)
  if (!upserted) return null

  await enqueueJob({
    userId: params.userId,
    jobType: "error_review_question_generate",
    idempotencyKey: `error_review_q:${params.attemptId}`,
    payload: {
      error_id: upserted.errorId,
      question_id: params.questionId,
      attempt_id: params.attemptId,
    },
    // Acima de question_resolve_ai (20) para não ficar eternamente na fila
    priority: 30,
  })

  // Processa agora (não depende só do after()/kick genérico)
  try {
    await runJobWorker(3, {
      userId: params.userId,
      jobTypes: ["error_review_question_generate"],
    })
  } catch (e) {
    console.warn(
      "[error-from-attempt] worker imediato falhou:",
      e instanceof Error ? e.message : e
    )
  }

  scheduleQuestionAiKick(params.userId)
  return upserted
}
