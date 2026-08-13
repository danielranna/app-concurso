import { supabaseServer } from "./supabase-server"
import {
  getQuizBotSecret,
  getQuizCadernoFromJsonUrl,
  getQuizSyncAssistUrl,
  getQuizSyncIngestUrl,
  getQuizSyncAnswersUrl,
  getQuizSyncInventoryUrl,
  getQuizSyncOmissasUrl,
} from "./quiz-bot-url"
import {
  computeOutcomeCategory,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
  refreshNotebookProgress,
} from "./question-study"
import { createNotebookFromQuestionIds } from "./notebook-from-performance"
import type { ConfidenceLevel } from "./question-types"

export function toWaLetter(type: string, selected: string): string {
  if (type === "certo_errado") {
    if (/^certo$/i.test(selected) || selected.toUpperCase() === "C") return "c"
    return "e"
  }
  return selected.trim().toLowerCase().slice(0, 1)
}

export function fromWaLetter(type: string, letter: string): string {
  const L = letter.trim().toLowerCase()
  if (type === "certo_errado") {
    if (L === "c") return "Certo"
    if (L === "e") return "Errado"
  }
  return L.toUpperCase()
}

async function quizFetch(url: string, init?: RequestInit) {
  const secret = getQuizBotSecret()
  if (!secret) throw new Error("Configure QUIZ_BOT_USERS_SECRET")
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

export async function resolveUserIdByJid(userJid: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("user_id")
    .eq("whatsapp_jid", userJid)
    .eq("whatsapp_authorized", true)
    .maybeSingle()
  return data?.user_id ?? null
}

export async function resolveJidByUserId(userId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("whatsapp_jid, whatsapp_authorized")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data?.whatsapp_jid || data.whatsapp_authorized === false) return null
  return data.whatsapp_jid
}

export async function getSyncForNotebook(notebookId: string) {
  const { data } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("*")
    .eq("notebook_id", notebookId)
    .maybeSingle()
  return data
}

export async function ensureReplica(
  sourceNotebookId: string,
  userId: string
): Promise<string> {
  const { data: existing } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("notebook_id")
    .eq("source_notebook_id", sourceNotebookId)
    .eq("user_id", userId)
    .maybeSingle()
  if (existing?.notebook_id) return existing.notebook_id as string

  const { data: source } = await supabaseServer
    .from("notebooks")
    .select("id, name, user_id")
    .eq("id", sourceNotebookId)
    .maybeSingle()
  if (!source) throw new Error("Caderno de origem não encontrado")

  if (source.user_id === userId) {
    await supabaseServer.from("quiz_notebook_replicas").upsert(
      {
        source_notebook_id: sourceNotebookId,
        user_id: userId,
        notebook_id: sourceNotebookId,
      },
      { onConflict: "source_notebook_id,user_id" }
    )
    return sourceNotebookId
  }

  const { data: nq } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", sourceNotebookId)
    .order("position", { ascending: true })

  const ids = (nq ?? []).map((r) => r.question_id as string)
  const replicaId = await createNotebookFromQuestionIds(
    userId,
    source.name as string,
    null,
    ids,
    null,
    true
  )
  await supabaseServer.from("quiz_notebook_replicas").insert({
    source_notebook_id: sourceNotebookId,
    user_id: userId,
    notebook_id: replicaId,
  })
  const { data: links } = await supabaseServer
    .from("quiz_question_links")
    .select("question_id, tec_id, caderno_id, caderno_question_id, published_question_id, short_id")
    .eq("notebook_id", sourceNotebookId)
  if (links?.length) {
    await supabaseServer.from("quiz_question_links").insert(
      links.map((l) => ({
        ...l,
        notebook_id: replicaId,
      }))
    )
  }
  return replicaId
}

export async function upsertSyncedNote(
  userId: string,
  questionId: string,
  body: string
) {
  const trimmed = body.trim()
  if (!trimmed) return
  const { data: existing } = await supabaseServer
    .from("question_note_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .eq("sync_origin", "whatsapp")
    .maybeSingle()
  if (existing?.id) {
    await supabaseServer
      .from("question_note_entries")
      .update({ body: trimmed })
      .eq("id", existing.id)
    return
  }
  await supabaseServer.from("question_note_entries").insert({
    user_id: userId,
    question_id: questionId,
    body: trimmed,
    sync_origin: "whatsapp",
  })
}

export async function ingestWhatsappAnswer(input: {
  tecId: number | null
  shortId?: string | null
  userJid: string
  answerLetter: string
  comment?: string | null
  confidenceLevel?: string
  durationMs?: number | null
  tags?: string[]
}) {
  const userId = await resolveUserIdByJid(input.userJid)
  if (!userId) return { skipped: true, reason: "jid_not_linked" }

  let questionId: string | null = null
  let questionType = "multiple_choice"
  let correct = ""
  let notebookId: string | null = null

  if (input.shortId) {
    const { data: link } = await supabaseServer
      .from("quiz_question_links")
      .select("question_id, notebook_id, tec_id")
      .eq("short_id", input.shortId.toUpperCase())
      .maybeSingle()
    if (link) {
      questionId = link.question_id
      const replica = await supabaseServer
        .from("quiz_notebook_replicas")
        .select("notebook_id")
        .eq("source_notebook_id", link.notebook_id)
        .eq("user_id", userId)
        .maybeSingle()
      notebookId = replica.data?.notebook_id ?? (await ensureReplica(link.notebook_id, userId))
    }
  }

  if (!questionId && input.tecId) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("tec_id", input.tecId)
      .maybeSingle()
    if (q) {
      questionId = q.id
      questionType = q.type
      correct = q.correct_answer
    }
    const { data: link } = await supabaseServer
      .from("quiz_question_links")
      .select("notebook_id")
      .eq("tec_id", input.tecId)
      .limit(1)
      .maybeSingle()
    if (link?.notebook_id) {
      notebookId = await ensureReplica(link.notebook_id, userId)
    }
  }

  if (!questionId) return { skipped: true, reason: "question_not_found" }

  if (!correct) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("type, correct_answer")
      .eq("id", questionId)
      .maybeSingle()
    questionType = q?.type ?? questionType
    correct = q?.correct_answer ?? ""
  }

  const selected = fromWaLetter(questionType, input.answerLetter)
  const isCorrect = normalizeAnswer(questionType, selected, correct)
  const confidence = parseConfidenceLevel(input.confidenceLevel)

  if (notebookId) {
    const { data: existing } = await supabaseServer
      .from("question_attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("notebook_id", notebookId)
      .eq("question_id", questionId)
      .limit(1)
      .maybeSingle()
    if (existing) {
      if (input.comment) await upsertSyncedNote(userId, questionId, input.comment)
      if (input.tags?.length) {
        await supabaseServer
          .from("question_attempts")
          .update({ attempt_tags: input.tags })
          .eq("id", existing.id)
      }
      return { ok: true, already: true }
    }
  }

  try {
    await recordAttempt({
      user_id: userId,
      question_id: questionId,
      notebook_id: notebookId,
      study_session_id: null,
      selected_answer: selected,
      is_correct: isCorrect,
      duration_ms: input.durationMs ?? null,
      confidence_level: confidence,
      attempt_tags: input.tags?.length ? input.tags : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (!/attempt_tags/i.test(msg)) throw e
  }

  if (input.tags?.length) {
    const { data: last } = await supabaseServer
      .from("question_attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (last?.id) {
      await supabaseServer
        .from("question_attempts")
        .update({ attempt_tags: input.tags })
        .eq("id", last.id)
    }
  }

  if (input.comment) await upsertSyncedNote(userId, questionId, input.comment)
  if (notebookId) await refreshNotebookProgress(notebookId, userId)

  return {
    ok: true,
    is_correct: isCorrect,
    outcome_category: computeOutcomeCategory(confidence, isCorrect),
  }
}

export async function pushAnswerToWhatsapp(input: {
  userId: string
  questionId: string
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  comment?: string | null
  tags?: string[]
}) {
  const jid = await resolveJidByUserId(input.userId)
  if (!jid) return { skipped: true, reason: "no_jid" }
  const ingestUrl = getQuizSyncIngestUrl()
  if (!ingestUrl) return { skipped: true, reason: "no_quiz_url" }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id, tec_id, type")
    .eq("id", input.questionId)
    .maybeSingle()
  if (!q) return { skipped: true, reason: "no_question" }

  const { data: link } = await supabaseServer
    .from("quiz_question_links")
    .select("short_id")
    .eq("question_id", input.questionId)
    .not("short_id", "is", null)
    .limit(1)
    .maybeSingle()

  const { res, data } = await quizFetch(ingestUrl, {
    method: "POST",
    body: JSON.stringify({
      userJid: jid,
      tecId: q.tec_id,
      shortId: link?.short_id ?? null,
      answerLetter: toWaLetter(q.type, input.selectedAnswer),
      comment: input.comment ?? null,
      confidenceLevel: input.confidenceLevel,
      durationMs: input.durationMs,
      tags: input.tags ?? [],
    }),
  })
  return { ok: res.ok, pending: Boolean(data.pending), data }
}

export async function flushPendingForTec(input: {
  tecId: number | null
  shortId: string
  publishedQuestionId?: number
}) {
  if (input.shortId && input.tecId) {
    await supabaseServer
      .from("quiz_question_links")
      .update({
        short_id: input.shortId.toUpperCase(),
        published_question_id: input.publishedQuestionId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tec_id", input.tecId)
  }
  if (!input.tecId) return { flushed: 0 }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id")
    .eq("tec_id", input.tecId)
    .maybeSingle()
  if (!q) return { flushed: 0 }

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("user_id, question_id, selected_answer, confidence_level, duration_ms, attempt_tags")
    .eq("question_id", q.id)
    .order("created_at", { ascending: false })

  const seen = new Set<string>()
  let flushed = 0
  for (const a of attempts ?? []) {
    if (seen.has(a.user_id)) continue
    seen.add(a.user_id)
    const result = await pushAnswerToWhatsapp({
      userId: a.user_id,
      questionId: a.question_id,
      selectedAnswer: a.selected_answer,
      confidenceLevel: parseConfidenceLevel(a.confidence_level),
      durationMs: a.duration_ms,
      tags: Array.isArray(a.attempt_tags) ? a.attempt_tags : [],
    })
    if (result.ok && !result.pending) flushed += 1
  }
  return { flushed }
}

export async function sendNotebookToWhatsapp(input: {
  notebookId: string
  userId: string
  name?: string
  activate?: boolean
  deliveryMode?: "group" | "private"
  schedule?: Record<string, unknown>
  privateRecipients?: { userJid: string; active?: boolean }[]
  createdByJid?: string
}) {
  const url = getQuizCadernoFromJsonUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")

  const { data: nq, error } = await supabaseServer
    .from("notebook_questions")
    .select(
      `
      position,
      question_id,
      questions (
        id, tec_id, tec_url, type, banca, tec_subject, statement, correct_answer
      )
    `
    )
    .eq("notebook_id", input.notebookId)
    .order("position", { ascending: true })
  if (error) throw new Error(error.message)

  const qids = (nq ?? []).map((r) => r.question_id as string)
  const { data: opts } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", qids)
    .order("sort_order")
  const optsByQ = new Map<string, { label: string; text: string }[]>()
  for (const o of opts ?? []) {
    const list = optsByQ.get(o.question_id) ?? []
    list.push({ label: o.label, text: o.text })
    optsByQ.set(o.question_id, list)
  }

  const questions = (nq ?? []).map((row, i) => {
    const q = unwrapQ(row.questions)
    return {
      position: row.position ?? i + 1,
      tecQuestionId: q?.tec_id,
      tecUrl: q?.tec_url,
      banca: q?.banca,
      subject: q?.tec_subject,
      questionType: q?.type,
      statement: q?.statement,
      options: optsByQ.get(row.question_id) ?? [],
      answerKey: q?.correct_answer,
    }
  })

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("name")
    .eq("id", input.notebookId)
    .maybeSingle()

  const { res, data } = await quizFetch(url, {
    method: "POST",
    body: JSON.stringify({
      name: input.name || nb?.name || "Caderno",
      originNotebookId: input.notebookId,
      activate: Boolean(input.activate),
      deliveryMode: input.deliveryMode ?? "group",
      schedule: input.schedule ?? {},
      privateRecipients: input.privateRecipients ?? [],
      createdByJid: input.createdByJid ?? null,
      questions,
    }),
  })
  if (!res.ok) {
    throw new Error(data.error || `Papa Vagas ${res.status}`)
  }

  const cadernoId = data.cadernoId
  await supabaseServer.from("quiz_notebook_sync").upsert(
    {
      notebook_id: input.notebookId,
      caderno_id: cadernoId,
      status: data.status ?? "inactive",
      delivery_mode: input.deliveryMode ?? "group",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "notebook_id" }
  )
  await supabaseServer.from("quiz_notebook_replicas").upsert(
    {
      source_notebook_id: input.notebookId,
      user_id: input.userId,
      notebook_id: input.notebookId,
    },
    { onConflict: "source_notebook_id,user_id" }
  )
  const linkRows = (nq ?? []).map((row, i) => {
    const q = unwrapQ(row.questions)
    return {
      notebook_id: input.notebookId,
      question_id: row.question_id,
      tec_id: q?.tec_id ?? 0,
      caderno_id: cadernoId,
      caderno_question_id: null,
      position_hint: row.position ?? i + 1,
    }
  })
  await supabaseServer.from("quiz_question_links").upsert(
    linkRows.map(({ position_hint: _p, ...rest }) => rest),
    { onConflict: "notebook_id,question_id" }
  )
  return data
}

function unwrapQ(q: unknown): {
  id?: string
  tec_id?: number
  tec_url?: string
  type?: string
  banca?: string | null
  tec_subject?: string | null
  statement?: string
  correct_answer?: string
} | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : (q as never)
}

export async function maybePushNotebookAnswer(input: {
  notebookId: string
  userId: string
  questionId: string
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  comment?: string | null
  tags?: string[]
}) {
  const sync = await getSyncForNotebook(input.notebookId)
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("id")
    .eq("notebook_id", input.notebookId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!sync && !replica) return { skipped: true }
  if (input.comment) {
    await upsertSyncedNote(input.userId, input.questionId, input.comment)
  }
  return pushAnswerToWhatsapp({
    userId: input.userId,
    questionId: input.questionId,
    selectedAnswer: input.selectedAnswer,
    confidenceLevel: input.confidenceLevel,
    durationMs: input.durationMs,
    comment: input.comment,
    tags: input.tags,
  })
}

export async function backfillWhatsappAnswers(userId: string, userJid: string) {
  const url = getQuizSyncAnswersUrl()
  if (!url) return { skipped: true as const, imported: 0 }
  const { res, data } = await quizFetch(`${url}?userJid=${encodeURIComponent(userJid)}`)
  if (!res.ok) return { skipped: true as const, imported: 0, error: data.error }
  const answers = Array.isArray(data.answers) ? data.answers : []
  let imported = 0
  for (const a of answers) {
    const letter = String(a.answerLetter || "").trim()
    if (!letter) continue
    try {
      const result = await ingestWhatsappAnswer({
        tecId: a.tecId != null ? Number(a.tecId) : null,
        shortId: a.shortId ?? null,
        userJid,
        answerLetter: letter,
        comment: a.comment ?? null,
        confidenceLevel: a.confidenceLevel,
        durationMs: a.durationMs ?? null,
        tags: Array.isArray(a.tags) ? a.tags : [],
      })
      if (result && "ok" in result && result.ok) imported += 1
    } catch {
      /* ignore item */
    }
  }
  return { skipped: false as const, imported }
}

export async function fetchOmissasFromQuiz(token: string) {
  const url = getQuizSyncOmissasUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")
  const { res, data } = await quizFetch(`${url}?t=${encodeURIComponent(token)}`)
  if (!res.ok) throw new Error(data.error || "Falha ao carregar omissas")
  return data
}

export async function fetchQuizInventory(userJid: string) {
  const url = getQuizSyncInventoryUrl()
  if (!url) return { assistEliminateQty: 0, categories: [] }
  const { res, data } = await quizFetch(`${url}?userJid=${encodeURIComponent(userJid)}`)
  if (!res.ok) return { assistEliminateQty: 0, categories: [] }
  return data
}

export async function callQuizAssist(userJid: string, shortId: string, letter: string) {
  const url = getQuizSyncAssistUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")
  const { res, data } = await quizFetch(url, {
    method: "POST",
    body: JSON.stringify({ userJid, shortId, letter }),
  })
  if (!res.ok) throw new Error(data.error || "Erro na assistência")
  return data
}
