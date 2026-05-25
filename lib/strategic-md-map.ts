import { matchScore, type SubjectRow } from "./incidence-subject-map"
import type {
  SlugSubjectMapping,
  StrategicMdBundle,
  StrategicMdMappings,
} from "./strategic-md-types"

/** slug → lista de subject_id (vazio = sem vínculo) */
export type SlugManualOverrides = Record<string, string[]>

export function normalizeSlugOverride(
  value: string | string[] | null | undefined
): string[] | undefined {
  if (value === undefined) return undefined
  if (value === null) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

export function topicCountForSlug(bundle: StrategicMdBundle, slug: string): number {
  return bundle.topics_by_slug[slug]?.length ?? 0
}

export function mapStrategicMdToSubjects(
  bundle: StrategicMdBundle,
  subjects: SubjectRow[],
  manualOverrides: SlugManualOverrides = {}
): StrategicMdMappings {
  const slugToName = new Map<string, string>()
  for (const s of bundle.edital_subjects) slugToName.set(s.slug, s.name)
  for (const s of bundle.subject_ranking) slugToName.set(s.slug, s.name)
  for (const s of bundle.incidence_subjects) slugToName.set(s.slug, s.name)
  for (const slug of Object.keys(bundle.topics_by_slug)) {
    if (!slugToName.has(slug)) slugToName.set(slug, slug)
  }

  const allSlugs = [...new Set(slugToName.keys())]
  const by_slug: SlugSubjectMapping[] = []

  for (const slug of allSlugs) {
    const md_name = slugToName.get(slug) ?? slug
    const topic_count = topicCountForSlug(bundle, slug)

    const override = normalizeSlugOverride(manualOverrides[slug])
    let subject_ids: string[] = []
    let match_score = 0
    const manual = override !== undefined

    if (override !== undefined) {
      subject_ids = override
      match_score = override.length ? 100 : 0
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
        subject_ids = [best.id]
        match_score = bestScore
      }
    }

    const subject_names = subject_ids
      .map((id) => subjects.find((s) => s.id === id)?.name)
      .filter((n): n is string => !!n)

    by_slug.push({
      slug,
      md_name,
      subject_ids,
      subject_names,
      subject_id: subject_ids[0] ?? null,
      subject_name: subject_names[0] ?? null,
      match_score,
      topic_count,
      manual,
    })
  }

  by_slug.sort((a, b) => b.match_score - a.match_score)

  const bySubject = new Map<string, string[]>()
  for (const row of by_slug) {
    for (const sid of row.subject_ids) {
      const list = bySubject.get(sid) ?? []
      if (!list.includes(row.slug)) list.push(row.slug)
      bySubject.set(sid, list)
    }
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
    .filter((r) => r.subject_ids.includes(subjectId))
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
