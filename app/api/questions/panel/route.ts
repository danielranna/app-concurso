import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { fetchAllPages } from "@/lib/supabase-pages"
import { isMissingLibrarySavedColumn } from "@/lib/notebook-library-saved"
import { excludeDuplicateUnassignedNotebooks } from "@/lib/quiz-sync"

type NotebookRow = {
  id: string
  name: string
  subject_id: string | null
  question_count: number | null
  answered_count: number | null
  completed_at: string | null
  created_at: string
  library_saved?: boolean | null
}

async function loadAllNotebooks(userId: string): Promise<{
  notebooks: NotebookRow[]
  hasLibrarySaved: boolean
}> {
  const withCol =
    "id, name, subject_id, question_count, answered_count, completed_at, created_at, library_saved"
  try {
    const notebooks = await fetchAllPages<NotebookRow>((from, to) =>
      supabaseServer
        .from("notebooks")
        .select(withCol)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to)
    )
    return { notebooks, hasLibrarySaved: true }
  } catch (e) {
    if (!isMissingLibrarySavedColumn(e as { message?: string })) throw e
    const notebooks = await fetchAllPages<NotebookRow>((from, to) =>
      supabaseServer
        .from("notebooks")
        .select(
          "id, name, subject_id, question_count, answered_count, completed_at, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to)
    )
    return { notebooks, hasLibrarySaved: false }
  }
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const [subjectsRes, notebooksRes, folders, bankCountRes] = await Promise.all([
      supabaseServer
        .from("subjects")
        .select("id, name")
        .eq("user_id", user_id)
        .order("name"),
      loadAllNotebooks(user_id),
      fetchAllPages<{ subject_id: string | null }>((from, to) =>
        supabaseServer
          .from("notebook_folders")
          .select("subject_id")
          .eq("user_id", user_id)
          .is("parent_id", null)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      supabaseServer
        .from("questions")
        .select("id", { count: "exact", head: true }),
    ])

    if (subjectsRes.error) throw new Error(subjectsRes.error.message)
    if (bankCountRes.error) throw new Error(bankCountRes.error.message)

    const notebooks = notebooksRes.notebooks
    const hasLibrarySaved = notebooksRes.hasLibrarySaved

    const folderCountBySubject = new Map<string, number>()
    for (const f of folders) {
      if (!f.subject_id) continue
      folderCountBySubject.set(
        f.subject_id,
        (folderCountBySubject.get(f.subject_id) ?? 0) + 1
      )
    }

    const saved = hasLibrarySaved
      ? notebooks.filter((nb) => nb.library_saved === true)
      : notebooks
    const bySubject = new Map<
      string,
      { notebook_count: number; total_questions: number; answered_questions: number }
    >()
    for (const nb of saved) {
      if (!nb.subject_id) continue
      const g = bySubject.get(nb.subject_id) ?? {
        notebook_count: 0,
        total_questions: 0,
        answered_questions: 0,
      }
      g.notebook_count += 1
      g.total_questions += nb.question_count ?? 0
      g.answered_questions += nb.answered_count ?? 0
      bySubject.set(nb.subject_id, g)
    }

    const result = (subjectsRes.data ?? []).map((s) => {
      const g = bySubject.get(s.id)
      const totalQ = g?.total_questions ?? 0
      const answeredQ = g?.answered_questions ?? 0
      return {
        id: s.id,
        name: s.name,
        folder_count: folderCountBySubject.get(s.id) ?? 0,
        notebook_count: g?.notebook_count ?? 0,
        total_questions: totalQ,
        answered_questions: answeredQ,
        correct: answeredQ,
        wrong: Math.max(0, totalQ - answeredQ),
      }
    })

    const unassignedNotebooks = await excludeDuplicateUnassignedNotebooks(
      user_id,
      saved.filter((nb) => nb.subject_id == null)
    )

    const ephemeralNotebooks = hasLibrarySaved
      ? notebooks.filter((nb) => nb.library_saved === false)
      : []

    return NextResponse.json({
      subjects: result,
      bank_total: bankCountRes.count ?? 0,
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
