import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

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

      const { count: nbCount } = await supabaseServer
        .from("notebooks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("subject_id", s.id)
        .eq("library_saved", true)

      const { data: notebooks } = await supabaseServer
        .from("notebooks")
        .select("question_count, answered_count")
        .eq("user_id", user_id)
        .eq("subject_id", s.id)
        .eq("library_saved", true)

      let totalQ = 0
      let answeredQ = 0
      let correct = 0
      let wrong = 0
      for (const nb of notebooks ?? []) {
        totalQ += nb.question_count ?? 0
        answeredQ += nb.answered_count ?? 0
      }

      if (notebooks?.length) {
        const ids = (
          await supabaseServer
            .from("notebooks")
            .select("id")
            .eq("user_id", user_id)
            .eq("subject_id", s.id)
            .eq("library_saved", true)
        ).data?.map((n) => n.id) ?? []

        if (ids.length) {
          const { data: attempts } = await supabaseServer
            .from("question_attempts")
            .select("is_correct")
            .eq("user_id", user_id)
            .in("notebook_id", ids)
          correct = (attempts ?? []).filter((a) => a.is_correct).length
          wrong = (attempts ?? []).length - correct
        }
      }

      return {
        id: s.id,
        name: s.name,
        folder_count: folderCount ?? 0,
        notebook_count: nbCount ?? 0,
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

  const { data: unassignedNotebooks } = await supabaseServer
    .from("notebooks")
    .select("id, name, question_count, answered_count, completed_at, created_at")
    .eq("user_id", user_id)
    .is("subject_id", null)
    .eq("library_saved", true)
    .order("created_at", { ascending: false })

  const { data: ephemeralNotebooks } = await supabaseServer
    .from("notebooks")
    .select("id, name, question_count, answered_count, completed_at, created_at")
    .eq("user_id", user_id)
    .eq("library_saved", false)
    .order("created_at", { ascending: false })

  return NextResponse.json({
    subjects: result,
    bank_total: bankTotal ?? 0,
    unassigned: {
      notebook_count: unassignedNotebooks?.length ?? 0,
      notebooks: unassignedNotebooks ?? [],
    },
    ephemeral: {
      notebook_count: ephemeralNotebooks?.length ?? 0,
      notebooks: ephemeralNotebooks ?? [],
    },
  })
}
