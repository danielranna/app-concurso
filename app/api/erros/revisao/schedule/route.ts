import { NextResponse } from "next/server"
import { ensureErrorReviewDeck } from "@/lib/error-review-flashcard"
import { supabaseServer } from "@/lib/supabase-server"

type SourceQuestion = {
  question_id: string
  tec_id: number | null
  tec_url: string | null
  app_href: string
  error_id: string
  created_at: string
}

/**
 * Lista cards do deck Revisão de Erros com datas, matéria e questões de origem
 * (podem ser várias quando o mesmo conhecimento agrupa erros).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const deckId = await ensureErrorReviewDeck(user_id)

    const { data: cards, error } = await supabaseServer
      .from("flashcards")
      .select("id, front_text, source_error_id, created_at")
      .eq("user_id", user_id)
      .eq("deck_id", deckId)
      .order("created_at", { ascending: false })

    if (error) throw new Error(error.message)

    const cardIds = (cards ?? []).map((c) => c.id)
    const statesByCard = new Map<string, string>()
    if (cardIds.length) {
      const { data: states } = await supabaseServer
        .from("flashcard_states")
        .select("card_id, due_at")
        .eq("user_id", user_id)
        .in("card_id", cardIds)
      for (const s of states ?? []) {
        statesByCard.set(s.card_id, s.due_at)
      }
    }

    const { data: linkedErrors } = await supabaseServer
      .from("errors")
      .select(
        "id, created_at, active_flashcard_id, source_question_id, topics(subject_id, subjects(id, name))"
      )
      .eq("user_id", user_id)
      .not("active_flashcard_id", "is", null)

    type ErrRow = {
      id: string
      created_at: string
      active_flashcard_id: string | null
      source_question_id: string | null
      topics?:
        | {
            subject_id?: string
            subjects?: { id?: string; name?: string } | { id?: string; name?: string }[]
          }
        | {
            subject_id?: string
            subjects?: { id?: string; name?: string } | { id?: string; name?: string }[]
          }[]
        | null
    }

    const errorsByCard = new Map<string, ErrRow[]>()
    for (const e of (linkedErrors ?? []) as ErrRow[]) {
      if (!e.active_flashcard_id) continue
      const list = errorsByCard.get(e.active_flashcard_id) ?? []
      list.push(e)
      errorsByCard.set(e.active_flashcard_id, list)
    }

    const missingErrorIds: string[] = []
    for (const c of cards ?? []) {
      const sourceErrorId = (c as { source_error_id?: string }).source_error_id
      if (!sourceErrorId) continue
      const list = errorsByCard.get(c.id) ?? []
      if (!list.some((e) => e.id === sourceErrorId)) {
        missingErrorIds.push(sourceErrorId)
      }
    }

    if (missingErrorIds.length) {
      const { data: extraErrors } = await supabaseServer
        .from("errors")
        .select(
          "id, created_at, active_flashcard_id, source_question_id, topics(subject_id, subjects(id, name))"
        )
        .in("id", [...new Set(missingErrorIds)])
      for (const src of (extraErrors ?? []) as ErrRow[]) {
        const card = (cards ?? []).find(
          (c) => (c as { source_error_id?: string }).source_error_id === src.id
        )
        if (!card) continue
        const list = errorsByCard.get(card.id) ?? []
        if (!list.some((e) => e.id === src.id)) {
          list.push(src)
          errorsByCard.set(card.id, list)
        }
      }
    }

    const questionIds = new Set<string>()
    for (const list of errorsByCard.values()) {
      for (const e of list) {
        if (e.source_question_id) questionIds.add(e.source_question_id)
      }
    }

    const questionMeta = new Map<
      string,
      { tec_id: number | null; tec_url: string | null }
    >()
    if (questionIds.size) {
      const { data: questions } = await supabaseServer
        .from("questions")
        .select("id, tec_id, tec_url")
        .in("id", [...questionIds])
      for (const q of questions ?? []) {
        questionMeta.set(q.id, {
          tec_id: q.tec_id != null ? Number(q.tec_id) : null,
          tec_url: q.tec_url ? String(q.tec_url) : null,
        })
      }
    }

    const subjectsMap = new Map<string, string>()
    const rows = []

    for (const c of cards ?? []) {
      const errs = errorsByCard.get(c.id) ?? []
      const primary = errs[0]
      const topics = primary?.topics
      const t = Array.isArray(topics) ? topics[0] : topics
      const sub = t?.subjects
      const s = Array.isArray(sub) ? sub[0] : sub
      const subjectId = (s?.id as string) ?? (t?.subject_id as string) ?? null
      const subjectName = (s?.name as string) ?? null
      if (subjectId && subjectName) subjectsMap.set(subjectId, subjectName)

      if (subject_id && subjectId !== subject_id) continue

      const sources: SourceQuestion[] = []
      const seenQ = new Set<string>()
      for (const e of errs) {
        const qid = e.source_question_id
        if (!qid || seenQ.has(qid)) continue
        seenQ.add(qid)
        const meta = questionMeta.get(qid)
        sources.push({
          question_id: qid,
          tec_id: meta?.tec_id ?? null,
          tec_url: meta?.tec_url ?? null,
          app_href: `/questoes/questao/${qid}`,
          error_id: e.id,
          created_at: e.created_at,
        })
      }

      const statement = String(c.front_text ?? "").trim()
      const earliest =
        errs.length > 0
          ? errs.reduce((min, e) =>
              e.created_at < min ? e.created_at : min,
              errs[0].created_at
            )
          : c.created_at

      rows.push({
        card_id: c.id,
        error_id: primary?.id ?? (c as { source_error_id?: string }).source_error_id ?? null,
        error_ids: errs.map((e) => e.id),
        statement_preview:
          statement.length > 120 ? `${statement.slice(0, 120)}…` : statement,
        subject_id: subjectId,
        subject_name: subjectName,
        created_at: earliest,
        next_review_at: statesByCard.get(c.id) ?? null,
        sources,
      })
    }

    const subjects = [...subjectsMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

    return NextResponse.json({ rows, subjects, deck_id: deckId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
