import { enqueueNotebookReport } from "./ai/notebook-report"
import { insertQuestionNote } from "./question-notes"
import {
  loadQuestionForStudy,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
} from "./question-study"
import { supabaseServer } from "./supabase-server"
import { matchSubjectId } from "./tec-subject-match"

const FOLDER_NAME = "Resoluções TEC"

export type TecCadernoSyncInput = {
  userId: string
  tecCadernoId: string
  name?: string
  materia?: string
  assunto?: string
  total?: number
  resolved?: number
  finish?: boolean
  create?: boolean
  questionId?: string
  selectedAnswer?: string
  confidenceLevel?: string
  noteDraft?: string
  aiRequested?: boolean
}

function notebookName(input: TecCadernoSyncInput) {
  const title = String(input.name || "").trim()
  if (title) return title.slice(0, 140)
  return "Caderno TEC " + input.tecCadernoId
}

async function ensureFolder(userId: string, subjectId: string | null) {
  const { data: folders, error } = await supabaseServer
    .from("notebook_folders")
    .select("id, name, subject_id")
    .eq("user_id", userId)
    .ilike("name", FOLDER_NAME)
  if (error) throw new Error(error.message)
  const found = (folders ?? []).find((row) => (row.subject_id ?? null) === subjectId)
  if (found) return found.id as string

  const { data, error: insertError } = await supabaseServer
    .from("notebook_folders")
    .insert({
      user_id: userId,
      name: FOLDER_NAME,
      subject_id: subjectId,
      parent_id: null,
    })
    .select("id")
    .single()
  if (insertError) throw new Error(insertError.message)
  return data.id as string
}

async function ensureNotebook(
  input: TecCadernoSyncInput,
  subjectId: string | null,
  folderId: string
) {
  const shareUrl = "https://www.tecconcursos.com.br/questoes/cadernos/" + input.tecCadernoId
  const { data: existing, error } = await supabaseServer
    .from("notebooks")
    .select("id, name, subject_id, completed_at")
    .eq("user_id", input.userId)
    .eq("share_url", shareUrl)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (existing) {
    const patch: Record<string, unknown> = {}
    if (!existing.subject_id && subjectId) {
      patch.subject_id = subjectId
      patch.folder_id = folderId
    }
    const nextName = notebookName(input)
    if (existing.name.startsWith("Caderno TEC ") && input.name) patch.name = nextName
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString()
      await supabaseServer.from("notebooks").update(patch).eq("id", existing.id)
    }
    return existing
  }

  const { data, error: insertError } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id: input.userId,
      name: notebookName(input),
      subject_id: subjectId,
      folder_id: folderId,
      share_url: shareUrl,
      question_count: Math.max(0, Number(input.total) || 0),
    })
    .select("id, name, subject_id, completed_at")
    .single()
  if (insertError) throw new Error(insertError.message)
  return data
}

async function addQuestion(notebookId: string, questionId: string) {
  const { data: already } = await supabaseServer
    .from("notebook_questions")
    .select("id")
    .eq("notebook_id", notebookId)
    .eq("question_id", questionId)
    .maybeSingle()
  if (already) return

  const { count } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)

  const { error } = await supabaseServer.from("notebook_questions").insert({
    notebook_id: notebookId,
    question_id: questionId,
    position: count ?? 0,
  })
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
}

async function updateCopyProgress(
  notebookId: string,
  userId: string,
  tecTotal: number,
  tecResolved: number,
  finish: boolean,
  alreadyCompleted: string | null
) {
  const { count } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)
  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("question_id")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
  const answered = new Set((attempts ?? []).map((row) => row.question_id)).size
  const rows = count ?? 0
  const done = rows > 0 && (finish || (tecTotal > 0 && tecResolved >= tecTotal))
  const questionCount = done
    ? Math.max(rows, answered)
    : tecTotal > 0
      ? Math.max(tecTotal, rows, answered + 1)
      : Math.max(rows, answered) + 1
  const update: Record<string, unknown> = {
    question_count: questionCount,
    answered_count: answered,
    last_accessed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const justCompleted = done && !alreadyCompleted
  if (done) {
    update.completed_at = alreadyCompleted ?? new Date().toISOString()
    if (justCompleted) update.report_pending = true
  }
  await supabaseServer.from("notebooks").update(update).eq("id", notebookId)
  if (justCompleted) {
    try {
      await enqueueNotebookReport(notebookId, userId)
    } catch (error) {
      console.warn("[tec-caderno] relatório:", error instanceof Error ? error.message : error)
    }
  }
  return {
    completed: done || Boolean(alreadyCompleted),
    justCompleted,
    answered,
    questionCount,
  }
}

async function findNotebook(userId: string, tecCadernoId: string) {
  const shareUrl = "https://www.tecconcursos.com.br/questoes/cadernos/" + tecCadernoId
  const { data, error } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
    .eq("share_url", shareUrl)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function syncTecCadernoCopy(input: TecCadernoSyncInput) {
  const found = await findNotebook(input.userId, input.tecCadernoId)
  if (!found && !input.create) {
    return {
      exists: false,
      notebook_id: "",
      notebook_name: "",
      subject_id: null,
      folder_name: FOLDER_NAME,
      href: "",
      recorded: false,
      already: false,
      is_correct: null,
      completed: false,
      just_completed: false,
      answered: 0,
      question_count: 0,
      materia_matched: false,
    }
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", input.userId)
  const { data: mappings } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("tec_subject, tec_topic, subject_id")
    .eq("user_id", input.userId)
  const subjectId = matchSubjectId(input.materia || "", subjects ?? [], mappings ?? [])
  const folderId = await ensureFolder(input.userId, subjectId)
  const notebook = await ensureNotebook(input, subjectId, folderId)

  let recorded = false
  let already = false
  let isCorrect: boolean | null = null
  if (input.questionId && input.selectedAnswer) {
    const { question } = await loadQuestionForStudy(input.questionId, input.userId)
    if (!question) throw new Error("Questão não encontrada.")
    await addQuestion(notebook.id, input.questionId)
    const { data: previous } = await supabaseServer
      .from("question_attempts")
      .select("id")
      .eq("user_id", input.userId)
      .eq("notebook_id", notebook.id)
      .eq("question_id", input.questionId)
      .limit(1)
    isCorrect = normalizeAnswer(question.type, input.selectedAnswer, question.correct_answer)
    const confidence = parseConfidenceLevel(input.confidenceLevel)
    const note = String(input.noteDraft || "").trim()
    if (previous && previous.length) {
      already = true
    } else {
      await recordAttempt({
        user_id: input.userId,
        question_id: input.questionId,
        notebook_id: notebook.id,
        study_session_id: null,
        selected_answer: input.selectedAnswer,
        is_correct: isCorrect,
        duration_ms: null,
        confidence_level: confidence,
      })
      recorded = true
    }
    if (note) {
      await insertQuestionNote(input.userId, input.questionId, note, {
        aiRequested: Boolean(input.aiRequested),
      })
    }
  }

  const progress = await updateCopyProgress(
    notebook.id,
    input.userId,
    Math.max(0, Number(input.total) || 0),
    Math.max(0, Number(input.resolved) || 0),
    Boolean(input.finish),
    notebook.completed_at
  )

  return {
    exists: true,
    notebook_id: notebook.id,
    notebook_name: notebookName(input),
    subject_id: subjectId,
    folder_name: FOLDER_NAME,
    href: "/questoes/cadernos/" + notebook.id,
    recorded,
    already,
    is_correct: isCorrect,
    completed: progress.completed,
    just_completed: progress.justCompleted,
    answered: progress.answered,
    question_count: progress.questionCount,
    materia_matched: Boolean(subjectId),
  }
}
