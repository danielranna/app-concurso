import { supabaseServer } from "./supabase-server"
import { syncNotebookToContentIndex } from "./content-index-sync"

export type RemoveQuestionMode = "notebook" | "bank"

async function recountNotebook(notebookId: string): Promise<number> {
  const { count } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)

  const question_count = count ?? 0
  await supabaseServer
    .from("notebooks")
    .update({
      question_count,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notebookId)

  return question_count
}

async function clearActiveIfNeeded(notebookId: string, questionId: string) {
  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("active_question_id")
    .eq("id", notebookId)
    .maybeSingle()

  if (nb?.active_question_id === questionId) {
    await supabaseServer
      .from("notebooks")
      .update({ active_question_id: null })
      .eq("id", notebookId)
  }
}

async function syncNotebookQuietly(userId: string, notebookId: string) {
  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("subject_id")
    .eq("id", notebookId)
    .maybeSingle()

  if (nb?.subject_id) {
    try {
      await syncNotebookToContentIndex(userId, notebookId, nb.subject_id)
    } catch {
      // best-effort index sync
    }
  }
}

/**
 * Remove a question from a notebook, or from the notebook and the global bank.
 * Bank mode deletes the shared `questions` row (cascades all notebook links).
 */
export async function removeQuestionFromNotebook(
  notebookId: string,
  questionId: string,
  userId: string,
  mode: RemoveQuestionMode
): Promise<{ question_count: number; mode: RemoveQuestionMode; other_notebooks: number }> {
  const { data: notebook, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id, user_id")
    .eq("id", notebookId)
    .maybeSingle()

  if (nbErr) throw new Error(nbErr.message)
  if (!notebook) throw new Error("Caderno não encontrado")
  if (notebook.user_id !== userId) throw new Error("Não autorizado")

  const { data: link, error: linkErr } = await supabaseServer
    .from("notebook_questions")
    .select("id")
    .eq("notebook_id", notebookId)
    .eq("question_id", questionId)
    .maybeSingle()

  if (linkErr) throw new Error(linkErr.message)
  if (!link) throw new Error("Questão não está neste caderno")

  if (mode === "notebook") {
    await clearActiveIfNeeded(notebookId, questionId)

    const { error: delLinkErr } = await supabaseServer
      .from("notebook_questions")
      .delete()
      .eq("notebook_id", notebookId)
      .eq("question_id", questionId)

    if (delLinkErr) throw new Error(delLinkErr.message)

    await supabaseServer
      .from("question_attempts")
      .delete()
      .eq("notebook_id", notebookId)
      .eq("question_id", questionId)
      .eq("user_id", userId)

    const question_count = await recountNotebook(notebookId)
    await syncNotebookQuietly(userId, notebookId)

    return { question_count, mode, other_notebooks: 0 }
  }

  const { data: otherLinks } = await supabaseServer
    .from("notebook_questions")
    .select("notebook_id")
    .eq("question_id", questionId)
    .neq("notebook_id", notebookId)

  const otherNotebookIds = [
    ...new Set((otherLinks ?? []).map((r) => r.notebook_id as string)),
  ]

  for (const id of [notebookId, ...otherNotebookIds]) {
    await clearActiveIfNeeded(id, questionId)
  }

  const { error: delQErr } = await supabaseServer
    .from("questions")
    .delete()
    .eq("id", questionId)

  if (delQErr) throw new Error(delQErr.message)

  const question_count = await recountNotebook(notebookId)
  for (const id of otherNotebookIds) {
    await recountNotebook(id)
    await syncNotebookQuietly(userId, id)
  }
  await syncNotebookQuietly(userId, notebookId)

  return {
    question_count,
    mode,
    other_notebooks: otherNotebookIds.length,
  }
}
