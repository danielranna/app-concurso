import { NextResponse } from "next/server"
import { ensureErrorReviewDeck } from "@/lib/error-review-flashcard"
import { supabaseServer } from "@/lib/supabase-server"

/**
 * Lista cards do deck Revisão de Erros com datas e matéria (para tabela na UI).
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

    const errorByCard = new Map<string, ErrRow>()
    for (const e of (linkedErrors ?? []) as ErrRow[]) {
      if (e.active_flashcard_id && !errorByCard.has(e.active_flashcard_id)) {
        errorByCard.set(e.active_flashcard_id, e)
      }
    }

    const subjectsMap = new Map<string, string>()
    const rows = []
    for (const c of cards ?? []) {
      const err = errorByCard.get(c.id)
      const topics = err?.topics
      const t = Array.isArray(topics) ? topics[0] : topics
      const sub = t?.subjects
      const s = Array.isArray(sub) ? sub[0] : sub
      const subjectId = (s?.id as string) ?? (t?.subject_id as string) ?? null
      const subjectName = (s?.name as string) ?? null
      if (subjectId && subjectName) subjectsMap.set(subjectId, subjectName)

      if (subject_id && subjectId !== subject_id) continue

      const statement = String(c.front_text ?? "").trim()
      rows.push({
        card_id: c.id,
        error_id: err?.id ?? (c as { source_error_id?: string }).source_error_id ?? null,
        statement_preview:
          statement.length > 120 ? `${statement.slice(0, 120)}…` : statement,
        subject_id: subjectId,
        subject_name: subjectName,
        created_at: err?.created_at ?? c.created_at,
        next_review_at: statesByCard.get(c.id) ?? null,
        source_question_id: err?.source_question_id ?? null,
        app_href: err?.source_question_id
          ? `/questoes/questao/${err.source_question_id}`
          : null,
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
