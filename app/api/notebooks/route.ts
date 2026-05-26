import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  filterNotebooksByLibrarySaved,
  isMissingLibrarySavedColumn,
  librarySavedFilterFromParams,
  type LibrarySavedFilter,
} from "@/lib/notebook-library-saved"

function applyLibraryFilterToQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter: LibrarySavedFilter
) {
  if (filter === "ephemeral_only") return query.eq("library_saved", false)
  if (filter === "saved_only") return query.eq("library_saved", true)
  return query
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const folder_id = searchParams.get("folder_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const libraryFilter = librarySavedFilterFromParams(searchParams)

  function buildBaseQuery() {
    let query = supabaseServer
      .from("notebooks")
      .select("*")
      .eq("user_id", user_id)
      .order("last_accessed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (searchParams.get("unassigned") === "1") query = query.is("subject_id", null)
    else if (subject_id) query = query.eq("subject_id", subject_id)
    if (folder_id) query = query.eq("folder_id", folder_id)
    if (searchParams.get("root_only") === "1") query = query.is("folder_id", null)
    return query
  }

  let { data, error } = await applyLibraryFilterToQuery(
    buildBaseQuery(),
    libraryFilter
  )

  if (error && libraryFilter !== "all" && isMissingLibrarySavedColumn(error)) {
    const fallback = await buildBaseQuery()
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    }
    data = filterNotebooksByLibrarySaved(fallback.data ?? [], libraryFilter)
    error = null
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data ?? []) as {
    answered_count?: number
    question_count?: number
  }[]
  if (searchParams.get("incomplete") === "1") {
    rows = rows.filter((nb) => (nb.answered_count ?? 0) < (nb.question_count ?? 0))
  }

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, subject_id, folder_id, share_url } = body
  if (!user_id || !name) {
    return NextResponse.json({ error: "user_id e name obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id,
      name,
      subject_id: subject_id ?? null,
      folder_id: folder_id ?? null,
      share_url: share_url ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
