import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  filterNotebooksByLibrarySaved,
  isMissingLibrarySavedColumn,
} from "@/lib/notebook-library-saved"

async function countNotebooksForSubject(
  user_id: string,
  subjectId: string
): Promise<number> {
  const withCol = await supabaseServer
    .from("notebooks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("subject_id", subjectId)
    .eq("library_saved", true)

  if (!withCol.error) return withCol.count ?? 0

  if (!isMissingLibrarySavedColumn(withCol.error)) {
    throw new Error(withCol.error.message)
  }

  const fallback = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", user_id)
    .eq("subject_id", subjectId)

  if (fallback.error) throw new Error(fallback.error.message)
  return (fallback.data ?? []).length
}

async function listSavedNotebookIds(
  user_id: string,
  subjectId: string
): Promise<string[]> {
  const withCol = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", user_id)
    .eq("subject_id", subjectId)
    .eq("library_saved", true)

  if (!withCol.error) {
    return (withCol.data ?? []).map((n) => n.id)
  }

  if (!isMissingLibrarySavedColumn(withCol.error)) {
    throw new Error(withCol.error.message)
  }

  const fallback = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", user_id)
    .eq("subject_id", subjectId)

  if (fallback.error) throw new Error(fallback.error.message)
  return (fallback.data ?? []).map((n: { id: string }) => n.id)
}

async function fetchNotebooksList(
  user_id: string,
  applyExtra: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    q: any
  ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  libraryFilter: "saved_only" | "ephemeral_only"
) {
  const baseFields =
    "id, name, question_count, answered_count, completed_at, created_at, library_saved"

  let query = applyExtra(
    supabaseServer.from("notebooks").select(baseFields).eq("user_id", user_id)
  )

  if (libraryFilter === "saved_only") {
    query = query.eq("library_saved", true)
  } else {
    query = query.eq("library_saved", false)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (!error) return data ?? []

  if (!isMissingLibrarySavedColumn(error)) {
    throw new Error(error.message)
  }

  const fallbackFields =
    "id, name, question_count, answered_count, completed_at, created_at"

  const fallback = await applyExtra(
    supabaseServer.from("notebooks").select(fallbackFields).eq("user_id", user_id)
  ).order("created_at", { ascending: false })

  if (fallback.error) throw new Error(fallback.error.message)
  return filterNotebooksByLibrarySaved(fallback.data ?? [], libraryFilter)
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", user_id)
      .order("name")

    const result = await Promise.all(
      (subjects ?? []).map(async (s) => {
        const { count: folderCount } = await supabaseServer
          .from("notebook_folders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("subject_id", s.id)
          .is("parent_id", null)

        const nbCount = await countNotebooksForSubject(user_id, s.id)

        const ids = await listSavedNotebookIds(user_id, s.id)

        let totalQ = 0
        let answeredQ = 0
        let correct = 0
        let wrong = 0

        if (ids.length) {
          const { data: notebooks } = await supabaseServer
            .from("notebooks")
            .select("question_count, answered_count")
            .in("id", ids)

          for (const nb of notebooks ?? []) {
            totalQ += nb.question_count ?? 0
            answeredQ += nb.answered_count ?? 0
          }

          const { data: attempts } = await supabaseServer
            .from("question_attempts")
            .select("is_correct")
            .eq("user_id", user_id)
            .in("notebook_id", ids)
          correct = (attempts ?? []).filter((a) => a.is_correct).length
          wrong = (attempts ?? []).length - correct
        }

        return {
          id: s.id,
          name: s.name,
          folder_count: folderCount ?? 0,
          notebook_count: nbCount,
          total_questions: totalQ,
          answered_questions: answeredQ,
          correct,
          wrong,
        }
      })
    )

    const { count: bankTotal } = await supabaseServer
      .from("questions")
      .select("id", { count: "exact", head: true })

    const unassignedNotebooks = await fetchNotebooksList(
      user_id,
      (q) => q.is("subject_id", null),
      "saved_only"
    )

    let ephemeralNotebooks: typeof unassignedNotebooks = []
    try {
      ephemeralNotebooks = await fetchNotebooksList(
        user_id,
        (q) => q,
        "ephemeral_only"
      )
    } catch (e) {
      if (!isMissingLibrarySavedColumn(e as { message?: string })) throw e
    }

    return NextResponse.json({
      subjects: result,
      bank_total: bankTotal ?? 0,
      unassigned: {
        notebook_count: unassignedNotebooks.length,
        notebooks: unassignedNotebooks,
      },
      ephemeral: {
        notebook_count: ephemeralNotebooks.length,
        notebooks: ephemeralNotebooks,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
