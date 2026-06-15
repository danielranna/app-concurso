import { supabaseServer } from "./supabase-server"

export type QuestionTaxonomyRow = {
  tec_subject: string | null
  tec_topic: string | null
  statement: string | null
}

const PAGE_SIZE = 1000

/** Carrega todas as linhas de taxonomia do banco global (paginado). */
export async function fetchAllQuestionTaxonomyRows(): Promise<QuestionTaxonomyRow[]> {
  const rows: QuestionTaxonomyRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseServer
      .from("questions")
      .select("tec_subject, tec_topic, statement")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function collectUserNotebookQuestionIds(userId: string): Promise<Set<string>> {
  const { data: notebooks, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)

  if (nbErr) throw new Error(nbErr.message)

  const notebookIds = (notebooks ?? []).map((n) => n.id as string)
  const questionIds = new Set<string>()
  if (!notebookIds.length) return questionIds

  for (let i = 0; i < notebookIds.length; i += 50) {
    const batch = notebookIds.slice(i, i + 50)
    let offset = 0

    while (true) {
      const { data, error } = await supabaseServer
        .from("notebook_questions")
        .select("question_id")
        .in("notebook_id", batch)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw new Error(error.message)
      const rows = data ?? []
      for (const row of rows) {
        if (row.question_id) questionIds.add(row.question_id as string)
      }
      if (rows.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  return questionIds
}

async function fetchTaxonomyRowsByQuestionIds(
  questionIds: string[]
): Promise<QuestionTaxonomyRow[]> {
  const rows: QuestionTaxonomyRow[] = []
  const ids = [...questionIds]

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { data, error } = await supabaseServer
      .from("questions")
      .select("tec_subject, tec_topic, statement")
      .in("id", batch)

    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
  }

  return rows
}

/**
 * Taxonomia TEC das questões nos cadernos do usuário.
 * Usado no mapeamento para não depender do banco global (limite de linhas / outros usuários).
 */
export async function fetchQuestionTaxonomyForUser(
  userId: string
): Promise<QuestionTaxonomyRow[]> {
  const questionIds = await collectUserNotebookQuestionIds(userId)
  if (!questionIds.size) {
    return fetchAllQuestionTaxonomyRows()
  }
  return fetchTaxonomyRowsByQuestionIds([...questionIds])
}
