import { supabaseServer } from "./supabase-server"
import type { BankFilters, QuestionRow } from "./question-types"
import {
  assessTecFacetQuality,
  buildTecGroupsFromRows,
  decodeTecTopicPair,
  type TecTaxonomyGroup,
} from "./tec-facets"

export type { TecTaxonomyGroup }

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,")
}

export async function fetchBankQuestions(
  filters: BankFilters,
  opts?: { limit?: number; offset?: number }
): Promise<{ questions: QuestionRow[]; total: number }> {
  let query = supabaseServer.from("questions").select("*", { count: "exact" })

  if (filters.banca?.length) query = query.in("banca", filters.banca)
  if (filters.orgao?.length) query = query.in("orgao", filters.orgao)
  if (filters.cargo?.length) query = query.in("cargo", filters.cargo)
  if (filters.ano?.length) query = query.in("ano", filters.ano)
  if (filters.tec_subject?.length) query = query.in("tec_subject", filters.tec_subject)
  if (filters.tec_topic_pairs?.length) {
    const orParts = filters.tec_topic_pairs.map(
      (p) => `and(tec_subject.eq.${escapeFilterValue(p.tec_subject)},tec_topic.eq.${escapeFilterValue(p.tec_topic)})`
    )
    query = query.or(orParts.join(","))
  } else if (filters.tec_topic?.length) {
    query = query.in("tec_topic", filters.tec_topic)
  }
  if (filters.type?.length) query = query.in("type", filters.type)
  if (filters.search?.trim()) {
    query = query.ilike("statement", `%${filters.search.trim()}%`)
  }

  if (filters.subject_id || filters.topic_id) {
    // Filter via mapping requires user_id — applied at API layer
  }

  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0
  query = query.order("imported_at", { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { questions: (data ?? []) as QuestionRow[], total: count ?? 0 }
}

export async function fetchFilterFacets(opts?: {
  includeHiddenTopics?: boolean
}): Promise<{
  bancas: string[]
  orgaos: string[]
  cargos: string[]
  anos: number[]
  tec_subjects: string[]
  tec_topics: string[]
  tec_groups: TecTaxonomyGroup[]
}> {
  const { data, error } = await supabaseServer
    .from("questions")
    .select("banca, orgao, cargo, ano, tec_subject, tec_topic")

  if (error) throw new Error(error.message)

  const rows = data ?? []
  const uniq = (arr: (string | number | null)[]) =>
    [...new Set(arr.filter(Boolean) as string[])].sort()

  const facetOk = (value: string | null) => assessTecFacetQuality(value) !== "hidden"

  const tec_groups = buildTecGroupsFromRows(rows, {
    includeHidden: opts?.includeHiddenTopics ?? false,
    includeWarn: true,
  })

  return {
    bancas: uniq(rows.map((r) => r.banca).filter(facetOk)),
    orgaos: uniq(rows.map((r) => r.orgao)),
    cargos: uniq(rows.map((r) => r.cargo)),
    anos: [...new Set(rows.map((r) => r.ano).filter((a): a is number => a != null))].sort(
      (a, b) => b - a
    ),
    tec_subjects: tec_groups.map((g) => g.tec_subject),
    tec_topics: tec_groups.flatMap((g) => g.topics),
    tec_groups,
  }
}

export function parseBankFiltersFromSearchParams(
  params: URLSearchParams
): BankFilters {
  const arr = (key: string) => {
    const v = params.getAll(key)
    return v.length ? v : undefined
  }
  const nums = (key: string) => {
    const v = params.getAll(key).map(Number).filter((n) => !Number.isNaN(n))
    return v.length ? v : undefined
  }
  const pairs = params.getAll("tec_pair")
  const tec_topic_pairs = pairs.length
    ? pairs.map(decodeTecTopicPair).filter((p): p is NonNullable<typeof p> => p != null)
    : undefined
  return {
    banca: arr("banca"),
    orgao: arr("orgao"),
    cargo: arr("cargo"),
    ano: nums("ano"),
    tec_subject: arr("tec_subject"),
    tec_topic: arr("tec_topic"),
    tec_topic_pairs,
    type: arr("type") as BankFilters["type"],
    subject_id: params.get("subject_id") ?? undefined,
    topic_id: params.get("topic_id") ?? undefined,
    search: params.get("search") ?? undefined,
  }
}

export async function applyMappingFilter(
  userId: string,
  filters: BankFilters
): Promise<BankFilters> {
  if (!filters.subject_id && !filters.topic_id) return filters

  const { data: mappings } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("tec_subject, tec_topic, subject_id, topic_id")
    .eq("user_id", userId)

  if (!mappings?.length) return { ...filters, tec_subject: ["__none__"] }

  const isSubjectLevel = (t: string | null) => !t || t.trim() === ""

  if (filters.subject_id) {
    const subjectTec = [
      ...new Set(
        mappings
          .filter(
            (m) =>
              isSubjectLevel(m.tec_topic) && m.subject_id === filters.subject_id
          )
          .map((m) => m.tec_subject)
          .filter(Boolean)
      ),
    ] as string[]

    const out: BankFilters = {
      ...filters,
      tec_subject: subjectTec.length ? subjectTec : ["__none__"],
    }

    if (filters.topic_id) {
      const topicTec = [
        ...new Set(
          mappings
            .filter(
              (m) =>
                !isSubjectLevel(m.tec_topic) &&
                m.topic_id === filters.topic_id &&
                subjectTec.includes(m.tec_subject)
            )
            .map((m) => m.tec_topic)
            .filter(Boolean)
        ),
      ] as string[]
      out.tec_topic = topicTec.length ? topicTec : ["__none__"]
    }

    return out
  }

  if (filters.topic_id) {
    const topicTec = [
      ...new Set(
        mappings
          .filter((m) => !isSubjectLevel(m.tec_topic) && m.topic_id === filters.topic_id)
          .map((m) => m.tec_topic)
          .filter(Boolean)
      ),
    ] as string[]
    return {
      ...filters,
      tec_topic: topicTec.length ? topicTec : ["__none__"],
    }
  }

  return filters
}
