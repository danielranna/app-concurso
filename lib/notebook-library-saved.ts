/** Filter when notebooks.library_saved exists (post sql-notebook-library-saved.sql). */

export type LibrarySavedFilter = "saved_only" | "ephemeral_only" | "all"

export function isMissingLibrarySavedColumn(error: {
  message?: string
  code?: string
}): boolean {
  const msg = (error.message ?? "").toLowerCase()
  return (
    msg.includes("library_saved") ||
    error.code === "42703" ||
    (msg.includes("column") && msg.includes("does not exist"))
  )
}

export function filterNotebooksByLibrarySaved<T extends { library_saved?: boolean | null }>(
  rows: T[],
  filter: LibrarySavedFilter
): T[] {
  if (filter === "all") return rows
  if (filter === "ephemeral_only") {
    return rows.filter((nb) => nb.library_saved === false)
  }
  return rows.filter((nb) => nb.library_saved !== false)
}

export function librarySavedFilterFromParams(searchParams: URLSearchParams): LibrarySavedFilter {
  if (searchParams.get("ephemeral") === "1") return "ephemeral_only"
  if (searchParams.get("include_ephemeral") === "1") return "all"
  return "saved_only"
}
