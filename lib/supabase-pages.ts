/** PostgREST default max rows per request. */
export const POSTGREST_MAX_ROWS = 1000

type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Walks `.range()` until a page comes back smaller than the PostgREST cap.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await fetchPage(
      offset,
      offset + POSTGREST_MAX_ROWS - 1
    )
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < POSTGREST_MAX_ROWS) break
    offset += POSTGREST_MAX_ROWS
  }
  return rows
}

/** Run async work over a list with a small concurrency cap (no sleep/throttle). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}
