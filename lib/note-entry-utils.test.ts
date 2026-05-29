import assert from "node:assert/strict"
import {
  combinePendingNoteBodies,
  splitPendingNoteEntries,
} from "./note-entry-utils"

{
  const entries = [
    {
      id: "a",
      body: "old",
      ai_processed_at: "2026-01-02",
      ai_feedback: "ok",
      ai_classify: { taxonomy: "falta_compreensao" },
    },
    { id: "b", body: "new" },
  ]
  const { pending, cached } = splitPendingNoteEntries(entries)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, "b")
  assert.equal(cached.length, 1)
  assert.equal(combinePendingNoteBodies(entries), "new")
}
