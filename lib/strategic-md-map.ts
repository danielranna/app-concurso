import { matchScore, normLabel, type SubjectRow } from "./incidence-subject-map"
import type {
  SlugSubjectMapping,
  StrategicMdBundle,
  StrategicMdMappings,
} from "./strategic-md-types"

export type SlugManualOverrides = Record<string, string | null>

export function mapStrategicMdToSubjects(
  bundle: StrategicMdBundle,
  subjects: SubjectRow[],
  manualOverrides: SlugManualOverrides = {}
): StrategicMdMappings {
  const slugToName = new Map<string, string>()
  for (const s of bundle.edital_subjects) slugToName.set(s.slug, s.name)
  for (const s of bundle.subject_ranking) slugToName.set(s.slug, s.name)
  for (const s of bundle.incidence_subjects) slugToName.set(s.slug, s.name)

  const allSlugs = [...new Set(slugToName.keys())]
  const by_slug: SlugSubjectMapping[] = []

  for (const slug of allSlugs) {
    const md_name = slugToName.get(slug) ?? slug
    const topic_count = bundle.topics_by_slug[slug]?.length ?? 0

    let subject_id: string | null = manualOverrides[slug] ?? null
    let match_score = 0
    let manual = manualOverrides[slug] !== undefined

    if (subject_id) {
      const sub = subjects.find((s) => s.id === subject_id)
      match_score = sub ? 100 : 0
    } else {
      let best: SubjectRow | null = null
      let bestScore = 0
      for (const sub of subjects) {
        const sc = matchScore(md_name, sub.name)
        if (sc > bestScore) {
          bestScore = sc
          best = sub
        }
      }
      if (best && bestScore >= 40) {
        subject_id = best.id
        match_score = bestScore
      }
    }

    by_slug.push({
      slug,
      md_name,
      subject_id,
      subject_name: subjects.find((s) => s.id === subject_id)?.name ?? null,
      match_score,
      topic_count,
      manual,
    })
  }

  by_slug.sort((a, b) => b.match_score - a.match_score)

  const bySubject = new Map<string, string[]>()
  for (const row of by_slug) {
    if (!row.subject_id) continue
    const list = bySubject.get(row.subject_id) ?? []
    list.push(row.slug)
    bySubject.set(row.subject_id, list)
  }

  const merge_warnings: StrategicMdMappings["merge_warnings"] = []
  for (const [subject_id, slugs] of bySubject) {
    if (slugs.length <= 1) continue
    const sub = subjects.find((s) => s.id === subject_id)
    merge_warnings.push({
      subject_id,
      subject_name: sub?.name ?? subject_id,
      slugs,
    })
  }

  return {
    by_slug,
    manual_overrides: manualOverrides,
    merge_warnings,
  }
}

export function resolveSlugsForSubject(
  mappings: StrategicMdMappings,
  subjectId: string
): string[] {
  return mappings.by_slug
    .filter((r) => r.subject_id === subjectId)
    .map((r) => r.slug)
}

export function mdNameForSlug(bundle: StrategicMdBundle, slug: string): string {
  return (
    bundle.edital_subjects.find((s) => s.slug === slug)?.name ??
    bundle.subject_ranking.find((s) => s.slug === slug)?.name ??
    bundle.incidence_subjects.find((s) => s.slug === slug)?.name ??
    slug
  )
}

export function labelsForSubjectFromMd(
  bundle: StrategicMdBundle,
  mappings: StrategicMdMappings,
  subjectId: string
): string[] {
  const slugs = resolveSlugsForSubject(mappings, subjectId)
  return slugs.map((slug) => mdNameForSlug(bundle, slug))
}
