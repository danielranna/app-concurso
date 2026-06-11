"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

export function useNotebookSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(allIds)
      const next = new Set([...prev].filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [allIds])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(allIds))
  }, [allIds])

  const clear = useCallback(() => {
    setSelected(new Set())
  }, [])

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  const selectedIds = useMemo(() => [...selected], [selected])

  return {
    selected,
    selectedIds,
    selectedCount: selected.size,
    hasSelection: selected.size > 0,
    allSelected: allIds.length > 0 && selected.size === allIds.length,
    toggle,
    selectAll,
    clear,
    isSelected,
  }
}
