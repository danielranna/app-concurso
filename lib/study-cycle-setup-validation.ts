export type CycleSetupIssue =
  | {
      kind: "subject_no_blocks"
      subject_id: string
      subject_name: string
    }
  | {
      kind: "block_incomplete"
      subject_id: string
      subject_name: string
      block_id: string
      block_name: string
    }

export type SubjectPlanForValidation = {
  subject_id: string
  subject_name?: string
  blocks: {
    id: string
    name: string
    topics: unknown[]
    study_note?: string | null
  }[]
}

export function collectCycleSetupIssues(
  subjectPlans: SubjectPlanForValidation[]
): CycleSetupIssue[] {
  const issues: CycleSetupIssue[] = []

  for (const sp of subjectPlans) {
    const subject_name = sp.subject_name ?? sp.subject_id

    if (!sp.blocks.length) {
      issues.push({
        kind: "subject_no_blocks",
        subject_id: sp.subject_id,
        subject_name,
      })
      continue
    }

    for (const b of sp.blocks) {
      if (!b.topics.length && !b.study_note?.trim()) {
        issues.push({
          kind: "block_incomplete",
          subject_id: sp.subject_id,
          subject_name,
          block_id: b.id,
          block_name: b.name,
        })
      }
    }
  }

  return issues
}

export function groupSetupIssuesBySubject(
  issues: CycleSetupIssue[]
): Map<string, { subject_name: string; issues: CycleSetupIssue[] }> {
  const map = new Map<string, { subject_name: string; issues: CycleSetupIssue[] }>()
  for (const issue of issues) {
    const entry = map.get(issue.subject_id) ?? {
      subject_name: issue.subject_name,
      issues: [],
    }
    entry.issues.push(issue)
    map.set(issue.subject_id, entry)
  }
  return map
}
