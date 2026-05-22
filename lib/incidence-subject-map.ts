import type { IncidenceSubjectBlock } from "./incidence-xlsx"

export function normLabel(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

/** Pontuação 0–100 entre rótulo do Excel e nome da sua matéria. */
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

/** Uma linha por bloco do Excel; cada matéria sua recebe no máximo o melhor bloco (score ≥ 40). */
export function mapIncidenceBlocksToSubjects(
  blocks: IncidenceSubjectBlock[],
  subjects: SubjectRow[]
): {
  by_subject: {
    subject_id: string
    subject_name: string
    excel_label: string
    match_score: number
    groups: IncidenceSubjectBlock["groups"]
  }[]
  by_block: IncidenceBlockMapping[]
  unmapped_subjects: SubjectRow[]
  unmapped_blocks: IncidenceSubjectBlock[]
} {
  const usedBlocks = new Set<string>()
  const by_subject: {
    subject_id: string
    subject_name: string
    excel_label: string
    match_score: number
    groups: IncidenceSubjectBlock["groups"]
  }[] = []

  for (const sub of subjects) {
    let best: IncidenceSubjectBlock | null = null
    let bestScore = 0
    for (const block of blocks) {
      const s = matchScore(block.subject_label, sub.name)
      if (s > bestScore) {
        bestScore = s
        best = block
      }
    }
    if (best && bestScore >= 40) {
      usedBlocks.add(best.subject_label)
      by_subject.push({
        subject_id: sub.id,
        subject_name: sub.name,
        excel_label: best.subject_label,
        match_score: bestScore,
        groups: best.groups,
      })
    }
  }

  const mappedSubjectIds = new Set(by_subject.map((r) => r.subject_id))
  const unmapped_subjects = subjects.filter((s) => !mappedSubjectIds.has(s.id))

  const by_block: IncidenceBlockMapping[] = blocks.map((block) => {
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

  return { by_subject, by_block, unmapped_subjects, unmapped_blocks }
}

export function groupsForSubjectFromBlocks(
  blocks: IncidenceSubjectBlock[],
  subjectName: string
) {
  const block = pickBlockForSubject(blocks, subjectName)
  return block?.groups ?? []
}
