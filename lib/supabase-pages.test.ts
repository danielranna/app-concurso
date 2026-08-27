import assert from "node:assert/strict"
import { fetchAllPages, mapPool, POSTGREST_MAX_ROWS } from "./supabase-pages"

async function testFetchAllPages() {
  const pages: string[][] = [
    Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => `a${i}`),
    Array.from({ length: 3 }, (_, i) => `b${i}`),
  ]
  const rows = await fetchAllPages<string>(async (from, to) => {
    const idx = from / POSTGREST_MAX_ROWS
    return { data: pages[idx] ?? [], error: null, from, to }
  })
  assert.equal(rows.length, POSTGREST_MAX_ROWS + 3)
  assert.equal(rows[0], "a0")
  assert.equal(rows.at(-1), "b2")
}

async function testFetchAllPagesThrows() {
  await assert.rejects(
    () =>
      fetchAllPages(async () => ({
        data: null,
        error: { message: "boom" },
      })),
    /boom/
  )
}

async function testMapPool() {
  const seen: number[] = []
  const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
    seen.push(n)
    return n * 10
  })
  assert.deepEqual(out, [10, 20, 30, 40, 50])
  assert.equal(seen.length, 5)
}

async function main() {
  await testFetchAllPages()
  await testFetchAllPagesThrows()
  await testMapPool()
  console.log("supabase-pages.test.ts ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
