import type { IncidenceSubjectBlock, IncidenceGroup } from "./incidence-xlsx"

export function normLabel(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

export function matchScore(excelLabel: string, subjectName: string): number {
  const a = normLabel(excelLabel)
  const b = normLabel(subjectName)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 75
  const aWords = a.split(/\s+/).filter((w) => w.length > 2)
  const bWords = b.split(/\s+/).filter((w) => w.length > 2)
  const shared = aWords.filter((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)))
  if (shared.length >= 2) return 60
  if (shared.length === 1) return 40
  return 0
}

export type SubjectRow = { id: string; name: string }

export type IncidenceBlockMapping = {
  excel_label: string
  subject_id: string | null
  subject_name: string | null
  match_score: number
  group_count: number
  manual?: boolean
}

export type ManualOverrides = Record<string, string | null>

function subjectById(subjects: SubjectRow[], id: string | null) {
  if (!id) return null
  return subjects.find((s) => s.id === id) ?? null
}

function mergeGroups(groupsList: IncidenceGroup[][]): IncidenceGroup[] {
  const byKey = new Map<string, IncidenceGroup>()
  for (const groups of groupsList) {
    for (const g of groups) {
      const key = `${g.code}::${normLabel(g.name)}`
      const existing = byKey.get(key)
      if (!existing || g.quantity > existing.quantity) {
        byKey.set(key, { ...g })
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.percent - a.percent)
}

export function pickBlockForSubject(
  blocks: IncidenceSubjectBlock[],
  subjectName: string
): IncidenceSubjectBlock | null {
  if (!blocks.length) return null
  let best: IncidenceSubjectBlock | null = null
  let bestScore = 0
  for (const block of blocks) {
    const s = matchScore(block.subject_label, subjectName)
    if (s > bestScore) {
      bestScore = s
      best = block
    }
  }
  return bestScore >= 40 ? best : null
}

export function blockForSubjectWithOverrides(
  blocks: IncidenceSubjectBlock[],
  subjects: SubjectRow[],
  subjectId: string,
  manualOverrides: ManualOverrides = {}
) {
  const labelsForSubject = Object.entries(manualOverrides)
    .filter(([, sid]) => sid === subjectId)
    .map(([label]) => label)

  if (labelsForSubject.length) {
    const matched = blocks.filter((b) => labelsForSubject.includes(b.subject_label))
    if (matched.length) {
      return {
        subject_label: matched.map((b) => b.subject_label).join(" + "),
        total_quantity: matched.reduce((s, b) => s + b.total_quantity, 0),
        groups: mergeGroups(matched.map((b) => b.groups)),
      }
    }
  }

  const sub = subjects.find((s) => s.id === subjectId)
  if (!sub) return null
  const claimed = new Set(
    Object.entries(manualOverrides)
      .filter(([, sid]) => sid != null)
      .map(([label]) => label)
  )
  const available = blocks.filter((b) => !claimed.has(b.subject_label))
  return pickBlockForSubject(available, sub.name)
}

export function mapIncidenceBlocksToSubjects(
  blocks: IncidenceSubjectBlock[],
  subjects: SubjectRow[],
  manualOverrides: ManualOverrides = {}
): {
  by_subject: {
    subject_id: string
    subject_name: string
    excel_label: string
    excel_labels: string[]
    match_score: number
    groups: IncidenceGroup[]
    manual?: boolean
  }[]
  by_block: IncidenceBlockMapping[]
  unmapped_subjects: SubjectRow[]
  unmapped_blocks: IncidenceSubjectBlock[]
  merge_warnings: { subject_id: string; subject_name: string; excel_labels: string[] }[]
} {
  const usedBlocks = new Set<string>()
  const mappedSubjectIds = new Set<string>()
  const by_subject: {
    subject_id: string
    subject_name: string
    excel_label: string
    excel_labels: string[]
    match_score: number
    groups: IncidenceGroup[]
    manual?: boolean
  }[] = []
  const merge_warnings: {
    subject_id: string
    subject_name: string
    excel_labels: string[]
  }[] = []

  const manualBySubject = new Map<string, string[]>()
  for (const [excelLabel, sid] of Object.entries(manualOverrides)) {
    if (sid == null) {
      usedBlocks.add(excelLabel)
      continue
    }
    const list = manualBySubject.get(sid) ?? []
    list.push(excelLabel)
    manualBySubject.set(sid, list)
  }

  for (const [subjectId, excelLabels] of manualBySubject) {
    const sub = subjectById(subjects, subjectId)
    if (!sub) continue
    const matchedBlocks = blocks.filter((b) => excelLabels.includes(b.subject_label))
    for (const lbl of excelLabels) usedBlocks.add(lbl)
    mappedSubjectIds.add(subjectId)

    if (excelLabels.length > 1) {
      merge_warnings.push({
        subject_id: subjectId,
        subject_name: sub.name,
        excel_labels: excelLabels,
      })
    }

    by_subject.push({
      subject_id: subjectId,
      subject_name: sub.name,
      excel_label: excelLabels.join(" + "),
      excel_labels: excelLabels,
      match_score: 100,
      groups: mergeGroups(matchedBlocks.map((b) => b.groups)),
      manual: true,
    })
  }

  for (const sub of subjects) {
    if (mappedSubjectIds.has(sub.id)) continue
    const available = blocks.filter((b) => !usedBlocks.has(b.subject_label))
    let best: IncidenceSubjectBlock | null = null
    let bestScore = 0
    for (const block of available) {
      const s = matchScore(block.subject_label, sub.name)
      if (s > bestScore) {
        bestScore = s
        best = block
      }
    }
    if (best && bestScore >= 40) {
      usedBlocks.add(best.subject_label)
      mappedSubjectIds.add(sub.id)
      by_subject.push({
        subject_id: sub.id,
        subject_name: sub.name,
        excel_label: best.subject_label,
        excel_labels: [best.subject_label],
        match_score: bestScore,
        groups: best.groups,
      })
    }
  }

  const unmapped_subjects = subjects.filter((s) => !mappedSubjectIds.has(s.id))

  const by_block: IncidenceBlockMapping[] = blocks.map((block) => {
    if (block.subject_label in manualOverrides) {
      const sid = manualOverrides[block.subject_label]
      const sub = subjectById(subjects, sid)
      return {
        excel_label: block.subject_label,
        subject_id: sid,
        subject_name: sub?.name ?? null,
        match_score: sid ? 100 : 0,
        group_count: block.groups.length,
        manual: true,
      }
    }
    const linked = by_subject.find((r) =>
      r.excel_labels.includes(block.subject_label)
    )
    if (linked) {
      return {
        excel_label: block.subject_label,
        subject_id: linked.subject_id,
        subject_name: linked.subject_name,
        match_score: linked.match_score,
        group_count: block.groups.length,
        manual: linked.manual,
      }
    }
    let bestSub: SubjectRow | null = null
    let bestScore = 0
    for (const sub of subjects) {
      const s = matchScore(block.subject_label, sub.name)
      if (s > bestScore) {
        bestScore = s
        bestSub = sub
      }
    }
    return {
      excel_label: block.subject_label,
      subject_id: bestScore >= 40 ? bestSub!.id : null,
      subject_name: bestScore >= 40 ? bestSub!.name : null,
      match_score: bestScore,
      group_count: block.groups.length,
    }
  })

  const unmapped_blocks = blocks.filter((b) => !usedBlocks.has(b.subject_label))

  return { by_subject, by_block, unmapped_subjects, unmapped_blocks, merge_warnings }
}

export function groupsForSubjectFromBlocks(
  blocks: IncidenceSubjectBlock[],
  subjectName: string,
  subjectId?: string,
  subjects: SubjectRow[] = [],
  manualOverrides: ManualOverrides = {}
) {
  if (subjectId) {
    const block = blockForSubjectWithOverrides(
      blocks,
      subjects.length ? subjects : [{ id: subjectId, name: subjectName }],
      subjectId,
      manualOverrides
    )
    if (block) return block.groups
  }
  const block = pickBlockForSubject(blocks, subjectName)
  return block?.groups ?? []
}
