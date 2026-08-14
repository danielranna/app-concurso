import { supabaseServer } from "./supabase-server"
import {
  getQuizBotSecret,
  getQuizCadernoFromJsonUrl,
  getQuizSyncAssistUrl,
  getQuizSyncIngestUrl,
  getQuizSyncAnswersUrl,
  getQuizSyncInventoryUrl,
  getQuizSyncOmissasUrl,
  getQuizSyncStatusUrl,
} from "./quiz-bot-url"
import { capQuizSyncPayload, logQuizSyncEvent } from "./quiz-sync-log"
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
  const certoErrado =
    type === "certo_errado" ||
    type === "true_false" ||
    L === "certo" ||
    L === "errado" ||
    L.startsWith("certo") ||
    L.startsWith("errado")
  if (certoErrado) {
    if (L === "c" || L.startsWith("certo")) return "Certo"
    if (L === "e" || L.startsWith("errado")) return "Errado"
  }
  return L.toUpperCase().slice(0, 1)
}

function kindFromQuizUrl(url: string): string {
  const u = url.toLowerCase()
  if (u.includes("caderno-from-json") || u.includes("caderno-upload")) return "send"
  if (u.includes("quiz-sync-ingest")) return "ingest"
  if (u.includes("quiz-sync-assist")) return "assist"
  if (u.includes("quiz-sync-omissas")) return "omissas"
  if (u.includes("quiz-sync-inventory")) return "inventory"
  if (u.includes("quiz-sync-answers")) return "answers"
  if (u.includes("quiz-sync-status")) return "status"
  return "out"
}

type QuizFetchMeta = {
  kind?: string
  cadernoId?: number | null
  tecId?: number | null
  userJid?: string | null
}

async function quizFetch(url: string, init?: RequestInit, meta?: QuizFetchMeta) {
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
  const kind = meta?.kind ?? kindFromQuizUrl(url)
  if (kind === "send" || kind === "ingest" || kind === "status" || kind === "unlink") {
    let requestBody: unknown = null
    if (typeof init?.body === "string") {
      try {
        requestBody = JSON.parse(init.body)
      } catch {
        requestBody = init.body.slice(0, 500)
      }
    }
    await logQuizSyncEvent({
      direction: "out",
      kind,
      ok: res.ok && !data.pending,
      http_status: res.status,
      pending: Boolean(data.pending),
      reason: data.reason || data.error || null,
      caderno_id: meta?.cadernoId ?? (data.cadernoId != null ? Number(data.cadernoId) : null),
      tec_id: meta?.tecId ?? null,
      user_jid: meta?.userJid ?? null,
      payload: capQuizSyncPayload({ url, request: requestBody, response: data }),
    })
  }
  return { res, data }
}

function jidCandidates(userJid: string): string[] {
  const raw = String(userJid || "").trim()
  if (!raw) return []
  const out = new Set<string>([raw])
  const at = raw.indexOf("@")
  const local = (at >= 0 ? raw.slice(0, at) : raw).trim()
  if (local) {
    out.add(`${local}@s.whatsapp.net`)
    out.add(`${local}@lid`)
  }
  return [...out]
}

export async function resolveUserIdByJid(userJid: string): Promise<string | null> {
  const candidates = jidCandidates(userJid)
  if (!candidates.length) return null
  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("user_id, whatsapp_jid")
    .eq("whatsapp_authorized", true)
    .in("whatsapp_jid", candidates)
    .limit(1)
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

export async function getSentCadernoForNotebook(notebookId: string): Promise<{
  cadernoId: number
  sourceNotebookId: string
} | null> {
  const direct = await getSyncForNotebook(notebookId)
  if (direct?.caderno_id) {
    return { cadernoId: Number(direct.caderno_id), sourceNotebookId: notebookId }
  }
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("source_notebook_id")
    .eq("notebook_id", notebookId)
    .maybeSingle()
  if (!replica?.source_notebook_id) return null
  const sync = await getSyncForNotebook(replica.source_notebook_id)
  if (!sync?.caderno_id) return null
  return {
    cadernoId: Number(sync.caderno_id),
    sourceNotebookId: replica.source_notebook_id as string,
  }
}

async function notebooksForCaderno(cadernoId: number): Promise<string[]> {
  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .eq("caderno_id", cadernoId)
  const sources = (syncs ?? []).map((s) => s.notebook_id as string)
  if (!sources.length) return []
  const { data: replicas } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("notebook_id")
    .in("source_notebook_id", sources)
  return [...new Set([...sources, ...(replicas ?? []).map((r) => r.notebook_id as string)])]
}

async function resolveSentNotebookForTec(
  userId: string,
  tecId: number,
  cadernoId?: number | null
): Promise<string | null> {
  if (cadernoId) {
    const { data: sync } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id")
      .eq("caderno_id", cadernoId)
      .maybeSingle()
    if (sync?.notebook_id) return ensureReplica(sync.notebook_id as string, userId)
  }
  const { data: links } = await supabaseServer
    .from("quiz_question_links")
    .select("notebook_id, caderno_id")
    .eq("tec_id", tecId)
  if (!links?.length) return null
  const cadernoIds = [
    ...new Set(links.map((l) => l.caderno_id).filter((id) => id != null)),
  ]
  if (cadernoIds.length) {
    const { data: syncs } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id, caderno_id")
      .in("caderno_id", cadernoIds)
    const sent = syncs?.[0]
    if (sent?.notebook_id) return ensureReplica(sent.notebook_id as string, userId)
  }
  return ensureReplica(links[0].notebook_id as string, userId)
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

async function findQuizQuestionLink(
  shortId: string,
  cadernoId?: number | null
): Promise<{
  question_id: string
  notebook_id: string
  tec_id: number
  caderno_id: number
} | null> {
  const sid = String(shortId || "").trim().toUpperCase()
  if (!sid) return null
  let q = supabaseServer
    .from("quiz_question_links")
    .select("question_id, notebook_id, tec_id, caderno_id")
    .eq("short_id", sid)
  if (cadernoId) q = q.eq("caderno_id", cadernoId)
  const { data: links } = await q.limit(20)
  if (!links?.length) return null
  const nbIds = links.map((l) => l.notebook_id)
  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .in("notebook_id", nbIds)
  const sourceSet = new Set((syncs ?? []).map((s) => s.notebook_id as string))
  const preferred = links.find((l) => sourceSet.has(l.notebook_id)) ?? links[0]
  return preferred
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

async function findQuestionInNotebook(
  notebookId: string,
  opts: { tecId?: number | null; questionId?: string | null }
): Promise<{ id: string; type: string; correct_answer: string } | null> {
  const { data: rows } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", notebookId)
  const ids = (rows ?? []).map((r) => r.question_id as string)
  if (!ids.length) return null

  if (opts.tecId) {
    const { data: qs } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("tec_id", opts.tecId)
      .in("id", ids)
      .limit(1)
    const q = qs?.[0]
    if (q) return q
  }
  if (opts.questionId && ids.includes(opts.questionId)) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("id", opts.questionId)
      .maybeSingle()
    if (q) return q
  }
  return null
}

async function resolveStudyTargetFromWa(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
}): Promise<
  | {
      ok: true
      userId: string
      notebookId: string
      questionId: string
      questionType: string
      correct: string
    }
  | { ok: false; reason: string }
> {
  const userId = await resolveUserIdByJid(input.userJid)
  if (!userId) return { ok: false, reason: "jid_not_linked" }

  let linkQuestionId: string | null = null
  let tecId = input.tecId ?? null
  let sourceNotebookId: string | null = null

  if (input.cadernoId) {
    const { data: sync } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id")
      .eq("caderno_id", input.cadernoId)
      .maybeSingle()
    sourceNotebookId = (sync?.notebook_id as string | undefined) ?? null
  }

  if (input.shortId) {
    const link = await findQuizQuestionLink(input.shortId, input.cadernoId)
    if (link) {
      linkQuestionId = link.question_id
      if (link.tec_id != null) tecId = Number(link.tec_id)
      if (!sourceNotebookId) sourceNotebookId = link.notebook_id
    }
  }

  let notebookId: string | null = null
  if (sourceNotebookId) {
    notebookId = await ensureReplica(sourceNotebookId, userId)
  } else if (tecId) {
    notebookId = await resolveSentNotebookForTec(userId, tecId, input.cadernoId)
  }

  if (!notebookId) return { ok: false, reason: "no_notebook" }

  const inNotebook = await findQuestionInNotebook(notebookId, {
    tecId,
    questionId: linkQuestionId,
  })
  if (!inNotebook) return { ok: false, reason: "question_not_in_notebook" }

  let questionType = inNotebook.type || "multiple_choice"
  const correct = inNotebook.correct_answer ?? ""
  if (/^(certo|errado)$/i.test(correct)) questionType = "certo_errado"

  return {
    ok: true,
    userId,
    notebookId,
    questionId: inNotebook.id,
    questionType,
    correct,
  }
}

export async function ingestWhatsappAnswer(input: {
  tecId: number | null
  shortId?: string | null
  cadernoId?: number | null
  userJid: string
  answerLetter: string
  comment?: string | null
  confidenceLevel?: string
  durationMs?: number | null
  tags?: string[]
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { skipped: true, reason: target.reason }

  const { userId, notebookId, questionId, questionType, correct } = target
  const selected = fromWaLetter(questionType, input.answerLetter)
  const isCorrect = normalizeAnswer(questionType, selected, correct)
  const confidence = parseConfidenceLevel(input.confidenceLevel)

  const { data: existing } = await supabaseServer
    .from("question_attempts")
    .select("id, selected_answer")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .eq("question_id", questionId)
    .limit(1)
    .maybeSingle()
  if (existing) {
    const stored = String(existing.selected_answer || "")
    const needsFix =
      questionType === "certo_errado" && !/^(certo|errado)$/i.test(stored)
    if (needsFix || (selected && stored !== selected)) {
      await supabaseServer
        .from("question_attempts")
        .update({
          selected_answer: selected,
          is_correct: isCorrect,
          confidence_level: confidence,
        })
        .eq("id", existing.id)
    }
    if (input.comment) await upsertSyncedNote(userId, questionId, input.comment)
    if (input.tags?.length) {
      await supabaseServer
        .from("question_attempts")
        .update({ attempt_tags: input.tags })
        .eq("id", existing.id)
    }
    await refreshNotebookProgress(notebookId, userId)
    return { ok: true, already: true, notebook_id: notebookId, question_id: questionId }
  }

  try {
    await recordAttempt({
      user_id: userId,
      question_id: questionId,
      notebook_id: notebookId,
      study_session_id: null,
      selected_answer: selected,
      is_correct: isCorrect,
      duration_ms: null,
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
    notebook_id: notebookId,
    question_id: questionId,
  }
}

export async function getWhatsappStudyContext(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { linked: false, reason: target.reason, notes: [], durationMs: null }

  const { data: attempt } = await supabaseServer
    .from("question_attempts")
    .select("duration_ms")
    .eq("user_id", target.userId)
    .eq("notebook_id", target.notebookId)
    .eq("question_id", target.questionId)
    .not("duration_ms", "is", null)
    .gt("duration_ms", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: notes } = await supabaseServer
    .from("question_note_entries")
    .select("id, body, created_at, sync_origin")
    .eq("user_id", target.userId)
    .eq("question_id", target.questionId)
    .order("created_at", { ascending: true })

  return {
    linked: true,
    durationMs: attempt?.duration_ms != null ? Number(attempt.duration_ms) : null,
    notes: (notes ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      created_at: n.created_at,
      origin: n.sync_origin === "whatsapp" ? "whatsapp" : "app",
    })),
  }
}

export async function addWhatsappStudyNote(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
  body: string
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { skipped: true, reason: target.reason }
  const trimmed = String(input.body || "").trim()
  if (!trimmed) return { skipped: true, reason: "empty" }

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .insert({
      user_id: target.userId,
      question_id: target.questionId,
      body: trimmed,
    })
    .select("id, body, created_at")
    .single()
  if (error) throw new Error(error.message)
  return {
    ok: true,
    note: {
      id: data.id,
      body: data.body,
      created_at: data.created_at,
      origin: "whatsapp" as const,
    },
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
  notebookId?: string | null
  cadernoId?: number | null
}) {
  const jid = await resolveJidByUserId(input.userId)
  if (!jid) {
    await logQuizSyncEvent({
      direction: "out",
      kind: "ingest",
      ok: false,
      reason: "no_jid",
      caderno_id: input.cadernoId ?? null,
      user_jid: null,
      payload: { userId: input.userId, questionId: input.questionId },
    })
    return { skipped: true, reason: "no_jid" }
  }
  const ingestUrl = getQuizSyncIngestUrl()
  if (!ingestUrl) return { skipped: true, reason: "no_quiz_url" }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id, tec_id, type")
    .eq("id", input.questionId)
    .maybeSingle()
  if (!q) return { skipped: true, reason: "no_question" }

  let cadernoId = input.cadernoId ?? null
  if (!cadernoId && input.notebookId) {
    const sent = await getSentCadernoForNotebook(input.notebookId)
    cadernoId = sent?.cadernoId ?? null
  }

  let linkQuery = supabaseServer
    .from("quiz_question_links")
    .select("short_id, caderno_id")
    .eq("question_id", input.questionId)
    .not("short_id", "is", null)
  if (cadernoId) linkQuery = linkQuery.eq("caderno_id", cadernoId)
  const { data: link } = await linkQuery.limit(1).maybeSingle()

  if (!cadernoId && link?.caderno_id) cadernoId = Number(link.caderno_id)

  const { res, data } = await quizFetch(
    ingestUrl,
    {
      method: "POST",
      body: JSON.stringify({
        userJid: jid,
        tecId: q.tec_id,
        cadernoId,
        shortId: link?.short_id ?? null,
        answerLetter: toWaLetter(q.type, input.selectedAnswer),
        comment: input.comment ?? null,
        confidenceLevel: input.confidenceLevel,
        durationMs: input.durationMs,
        tags: input.tags ?? [],
      }),
    },
    {
      kind: "ingest",
      cadernoId,
      tecId: q.tec_id != null ? Number(q.tec_id) : null,
      userJid: jid,
    }
  )
  return { ok: res.ok, pending: Boolean(data.pending), data }
}

export async function flushPendingForTec(input: {
  tecId: number | null
  shortId: string
  publishedQuestionId?: number
  cadernoId?: number
}) {
  if (input.shortId && input.tecId) {
    let upd = supabaseServer
      .from("quiz_question_links")
      .update({
        short_id: input.shortId.toUpperCase(),
        published_question_id: input.publishedQuestionId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tec_id", input.tecId)
    if (input.cadernoId) upd = upd.eq("caderno_id", input.cadernoId)
    await upd
  }
  if (!input.tecId) return { flushed: 0, reason: "no_tec_id" }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id")
    .eq("tec_id", input.tecId)
    .maybeSingle()
  if (!q) return { flushed: 0, reason: "no_question" }

  let attemptQuery = supabaseServer
    .from("question_attempts")
    .select("user_id, question_id, selected_answer, confidence_level, duration_ms, attempt_tags, notebook_id")
    .eq("question_id", q.id)
    .order("created_at", { ascending: false })

  if (input.cadernoId) {
    const nbIds = await notebooksForCaderno(input.cadernoId)
    if (nbIds.length) attemptQuery = attemptQuery.in("notebook_id", nbIds)
  }

  const { data: attempts } = await attemptQuery
  if (!attempts?.length) return { flushed: 0, reason: "no_attempts" }

  const seen = new Set<string>()
  let flushed = 0
  let lastSkip: string | null = null
  for (const a of attempts) {
    if (seen.has(a.user_id)) continue
    seen.add(a.user_id)
    const result = await pushAnswerToWhatsapp({
      userId: a.user_id,
      questionId: a.question_id,
      selectedAnswer: a.selected_answer,
      confidenceLevel: parseConfidenceLevel(a.confidence_level),
      durationMs: a.duration_ms,
      tags: Array.isArray(a.attempt_tags) ? a.attempt_tags : [],
      notebookId: a.notebook_id,
      cadernoId: input.cadernoId ?? null,
    })
    if (result.ok && !result.pending) flushed += 1
    else if ("reason" in result && result.reason) lastSkip = String(result.reason)
    else if (result.pending) lastSkip = "pending"
  }
  return {
    flushed,
    reason: flushed > 0 ? null : lastSkip ?? "push_failed",
  }
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
      position: i + 1,
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

  const { res, data } = await quizFetch(
    url,
    {
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
    },
    { kind: "send" }
  )
  if (!res.ok) {
    throw new Error(data.error || `Papa Vagas ${res.status}`)
  }

  const cadernoId = data.cadernoId
  const totalQuestions = Number(data.totalQuestions) || 0
  if (!cadernoId || totalQuestions <= 0) {
    throw new Error(
      "Caderno criado sem questões no Papa Vagas. Apague o caderno vazio lá e envie de novo."
    )
  }

  await supabaseServer.from("quiz_notebook_sync").upsert(
    {
      notebook_id: input.notebookId,
      caderno_id: cadernoId,
      status: data.status === "inactive" ? "pending" : (data.status ?? "pending"),
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
  const remoteByPos = new Map<number, { id?: number; tecQuestionId?: string | null }>()
  for (const rq of Array.isArray(data.questions) ? data.questions : []) {
    const pos = Number(rq.position)
    if (Number.isFinite(pos)) remoteByPos.set(pos, rq)
  }
  const linkRows = (nq ?? []).map((row, i) => {
    const q = unwrapQ(row.questions)
    const remote = remoteByPos.get(i + 1)
    return {
      notebook_id: input.notebookId,
      question_id: row.question_id,
      tec_id: q?.tec_id ?? 0,
      caderno_id: cadernoId,
      caderno_question_id: remote?.id ?? null,
    }
  })
  await supabaseServer.from("quiz_question_links").upsert(linkRows, {
    onConflict: "notebook_id,question_id",
  })
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
  const sent = await getSentCadernoForNotebook(input.notebookId)
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("id")
    .eq("notebook_id", input.notebookId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!sent && !replica) return { skipped: true }
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
    notebookId: input.notebookId,
    cadernoId: sent?.cadernoId ?? null,
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

export async function unlinkCadernoFromApp(cadernoId: number) {
  await supabaseServer.from("quiz_question_links").delete().eq("caderno_id", cadernoId)
  await supabaseServer.from("quiz_notebook_sync").delete().eq("caderno_id", cadernoId)
}

export type SyncPerson = {
  label: string
  userJid: string | null
  appSynced: boolean
  chatbotSynced: boolean
  line: string
}

export async function fetchAppSideRoster(cadernoId: number): Promise<{
  notebookId: string | null
  people: { label: string; userJid: string | null; appSynced: boolean }[]
}> {
  const { data: sync } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .eq("caderno_id", cadernoId)
    .maybeSingle()
  const notebookId = (sync?.notebook_id as string | undefined) ?? null
  const people: { label: string; userJid: string | null; appSynced: boolean }[] = []
  if (!notebookId) return { notebookId: null, people }

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("user_id")
    .eq("id", notebookId)
    .maybeSingle()
  const { data: replicas } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("user_id")
    .eq("source_notebook_id", notebookId)
  const userIds = [
    ...new Set(
      [nb?.user_id, ...(replicas ?? []).map((r) => r.user_id)].filter(Boolean) as string[]
    ),
  ]
  if (!userIds.length) return { notebookId, people }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("user_id, whatsapp_jid, whatsapp_display_label, whatsapp_authorized")
    .in("user_id", userIds)
  for (const uid of userIds) {
    const s = settings?.find((x) => x.user_id === uid)
    people.push({
      label: s?.whatsapp_display_label || s?.whatsapp_jid || uid.slice(0, 8),
      userJid: s?.whatsapp_jid ?? null,
      appSynced: Boolean(s?.whatsapp_jid && s.whatsapp_authorized),
    })
  }
  return { notebookId, people }
}

export async function fetchCadernoSyncRoster(cadernoId: number): Promise<{
  cadernoId: number
  notebookId: string | null
  originNotebookId: string | null
  people: SyncPerson[]
}> {
  const appSide = await fetchAppSideRoster(cadernoId)
  const notebookId = appSide.notebookId

  const statusUrl = getQuizSyncStatusUrl()
  let engaged: { userJid: string; displayLabel?: string; engaged?: boolean }[] = []
  let links: { userJid: string; displayLabel?: string | null; status?: string }[] = []
  if (statusUrl) {
    const { res, data } = await quizFetch(`${statusUrl}?cadernoId=${cadernoId}`, undefined, {
      kind: "status",
      cadernoId,
    })
    if (res.ok) {
      engaged = Array.isArray(data.engaged) ? data.engaged : []
      links = Array.isArray(data.flashcardsLinks) ? data.flashcardsLinks : []
    }
  }

  const chatbotByJid = new Map<string, { label: string; synced: boolean }>()
  for (const e of engaged) {
    if (!e.userJid) continue
    chatbotByJid.set(e.userJid, {
      label: e.displayLabel || e.userJid,
      synced: e.engaged !== false,
    })
  }
  for (const l of links) {
    if (!l.userJid) continue
    const prev = chatbotByJid.get(l.userJid)
    chatbotByJid.set(l.userJid, {
      label: l.displayLabel || prev?.label || l.userJid,
      synced: l.status === "active" || Boolean(prev?.synced),
    })
  }

  const seenJid = new Set<string>()
  const people: SyncPerson[] = []
  for (const p of appSide.people) {
    if (p.userJid) seenJid.add(p.userJid)
    const bot = p.userJid ? chatbotByJid.get(p.userJid) : undefined
    const chatbotSynced = Boolean(bot?.synced)
    people.push({
      label: p.label,
      userJid: p.userJid,
      appSynced: p.appSynced,
      chatbotSynced,
      line: `${p.label} — ${p.appSynced ? "sincronizado" : "não sincronizado"} no app · ${
        chatbotSynced ? "sincronizado" : "não sincronizado"
      } no chatbot`,
    })
  }
  for (const [jid, bot] of chatbotByJid) {
    if (seenJid.has(jid)) continue
    people.push({
      label: bot.label,
      userJid: jid,
      appSynced: false,
      chatbotSynced: bot.synced,
      line: `${bot.label} — não sincronizado no app · ${
        bot.synced ? "sincronizado" : "não sincronizado"
      } no chatbot`,
    })
  }

  return {
    cadernoId,
    notebookId,
    originNotebookId: notebookId,
    people,
  }
}
