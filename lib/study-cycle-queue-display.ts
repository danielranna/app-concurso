import type { StudyCycle, StudyCycleBlock, StudyCycleContentBlock } from "./study-cycle-types"

export function resolveQueueContentBlock(
  cycle: StudyCycle,
  item: StudyCycleBlock | null | undefined
): StudyCycleContentBlock | null {
  if (!item?.content_block_id || !cycle.content_blocks?.length) return null
  return (
    cycle.content_blocks.find((b) => b.id === item.content_block_id) ?? null
  )
}

export function resolveQueueNotebook(
  cycle: StudyCycle,
  item: StudyCycleBlock | null | undefined
): { id: string; name: string } | null {
  const content = resolveQueueContentBlock(cycle, item)
  const id = content?.notebook_id ?? item?.params?.notebook_id ?? null
  if (!id) return null
  return {
    id,
    name: content?.notebook_name ?? "Caderno",
  }
}
