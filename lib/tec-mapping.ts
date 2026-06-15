import { supabaseServer } from "./supabase-server"
import { assessTecFacetQuality } from "./tec-facets"
import { flattenFolderTopics } from "./study-cycle-topic-utils"
import {
  fetchTecSubjectTree,
  listTecSubjectSummaries,
} from "./tec-subject-tree"
import type { TecSubjectNode } from "./tec-subject-tree-types"
import { mirrorTecTreeToContentIndex } from "./tec-subject-tree"

export type TecSubjectOverview = {
  tec_subject: string
  question_count: number
  sample_statement: string
  topics_preview: string[]
  subject_mapped: boolean
  mapped_subject_id: string | null
  mapped_subject_name: string | null
  mapped_topics: number
  total_topics: number
  has_tree: boolean
}

export type BulkMapMode = "per_topic" | "single_topic"

export type TecSubjectGroup = {
  tec_subject: string
  count: number
  sample_statement: string
  topics_preview: string[]
}

export type TecTopicGroup = {
  tec_subject: string
  tec_topic: string
  count: number
  sample_statement: string
  mapped_subject_id: string | null
  mapped_subject_name: string | null
}

function normKey(s: string) {
  return (s ?? "").trim()
}

export function isSubjectLevelMapping(tec_topic: string | null | undefined) {
  return !tec_topic || tec_topic.trim() === ""
}

export async function loadMappings(userId: string) {
  const { data } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("id, tec_subject, tec_topic, subject_id, topic_id")
    .eq("user_id", userId)
  return data ?? []
}

/** Matérias TEC ainda sem vínculo com a sua matéria (uma linha = toda a matéria TEC). */
export async function listUnmappedTecSubjects(
  userId: string
): Promise<TecSubjectGroup[]> {
  const { data: questions } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic, statement")

  const mappings = await loadMappings(userId)
  const mappedSubjects = new Set(
    mappings
      .filter((m) => isSubjectLevelMapping(m.tec_topic))
      .map((m) => normKey(m.tec_subject))
  )

  const groups = new Map<
    string,
    { count: number; sample_statement: string; topics: Set<string> }
  >()

  for (const q of questions ?? []) {
    const sub = normKey(q.tec_subject ?? "")
    if (!sub || mappedSubjects.has(sub)) continue
    const g = groups.get(sub) ?? {
      count: 0,
      sample_statement: "",
      topics: new Set<string>(),
    }
    g.count++
    if (!g.sample_statement && q.statement) {
      g.sample_statement = q.statement.slice(0, 280)
    }
    if (q.tec_topic) g.topics.add(q.tec_topic)
    groups.set(sub, g)
  }

  return [...groups.entries()]
    .map(([tec_subject, g]) => ({
      tec_subject,
      count: g.count,
      sample_statement: g.sample_statement,
      topics_preview: [...g.topics].slice(0, 5),
    }))
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

/** Assuntos TEC ainda sem vínculo com o seu tema (matéria TEC já pode estar vinculada). */
export async function listUnmappedTecTopics(userId: string): Promise<TecTopicGroup[]> {
  const { data: questions } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic, statement")

  const mappings = await loadMappings(userId)
  const mappedTopicKeys = new Set(
    mappings
      .filter((m) => !isSubjectLevelMapping(m.tec_topic))
      .map((m) => `${normKey(m.tec_subject)}|||${normKey(m.tec_topic)}`)
  )

  const subjectMap = new Map<string, { subject_id: string }>()
  for (const m of mappings.filter((x) => isSubjectLevelMapping(x.tec_topic))) {
    subjectMap.set(normKey(m.tec_subject), { subject_id: m.subject_id })
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)
  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const groups = new Map<
    string,
    { tec_subject: string; tec_topic: string; count: number; sample_statement: string }
  >()

  for (const q of questions ?? []) {
    const sub = normKey(q.tec_subject ?? "")
    const top = normKey(q.tec_topic ?? "")
    if (!sub || !top) continue
    if (assessTecFacetQuality(top) === "hidden") continue
    const key = `${sub}|||${top}`
    if (mappedTopicKeys.has(key)) continue

    const g = groups.get(key) ?? {
      tec_subject: sub,
      tec_topic: top,
      count: 0,
      sample_statement: "",
    }
    g.count++
    if (!g.sample_statement && q.statement) {
      g.sample_statement = q.statement.slice(0, 280)
    }
    groups.set(key, g)
  }

  return [...groups.values()]
    .map((g) => {
      const sm = subjectMap.get(normKey(g.tec_subject))
      const sid = sm?.subject_id ?? null
      return {
        ...g,
        mapped_subject_id: sid,
        mapped_subject_name: sid ? subjectNames.get(sid) ?? null : null,
      }
    })
    .sort((a, b) =>
      a.tec_subject.localeCompare(b.tec_subject, "pt-BR") ||
      a.tec_topic.localeCompare(b.tec_topic, "pt-BR")
    )
}

export async function saveSubjectMapping(
  userId: string,
  tec_subject: string,
  subject_id: string
) {
  const { data, error } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .upsert(
      {
        user_id: userId,
        tec_subject: tec_subject.trim(),
        tec_topic: "",
        subject_id,
        topic_id: null,
      },
      { onConflict: "user_id,tec_subject,tec_topic" }
    )
    .select()
    .single()
  if (error) throw new Error(error.message)

  try {
    await mirrorTecTreeToContentIndex(userId, tec_subject.trim(), subject_id)
  } catch {
    /* espelho opcional */
  }

  return data
}

export async function saveTopicMapping(
  userId: string,
  tec_subject: string,
  tec_topic: string,
  topic_id: string,
  target_subject_id?: string
) {
  const mappings = await loadMappings(userId)
  const subjectMapping = mappings.find(
    (m) =>
      isSubjectLevelMapping(m.tec_topic) &&
      normKey(m.tec_subject) === normKey(tec_subject)
  )

  const subject_id = target_subject_id ?? subjectMapping?.subject_id
  if (!subject_id) {
    throw new Error(
      "Vincule primeiro a matéria TEC à sua matéria antes de associar o assunto."
    )
  }

  const { data: topicRow } = await supabaseServer
    .from("topics")
    .select("id, subject_id")
    .eq("id", topic_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!topicRow || topicRow.subject_id !== subject_id) {
    throw new Error("O tema selecionado não pertence à matéria de destino.")
  }

  const { data, error } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .upsert(
      {
        user_id: userId,
        tec_subject: tec_subject.trim(),
        tec_topic: tec_topic.trim(),
        subject_id,
        topic_id,
      },
      { onConflict: "user_id,tec_subject,tec_topic" }
    )
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Cria tema com o nome do assunto TEC e associa. */
export async function createTopicAndMapping(
  userId: string,
  tec_subject: string,
  tec_topic: string,
  target_subject_id?: string
) {
  const mappings = await loadMappings(userId)
  const subjectMapping = mappings.find(
    (m) =>
      isSubjectLevelMapping(m.tec_topic) &&
      normKey(m.tec_subject) === normKey(tec_subject)
  )

  const subject_id = target_subject_id ?? subjectMapping?.subject_id
  if (!subject_id) {
    throw new Error("Vincule a matéria TEC antes de criar o tema.")
  }

  const { data: topic, error: topicErr } = await supabaseServer
    .from("topics")
    .insert({
      user_id: userId,
      subject_id,
      name: tec_topic.trim(),
    })
    .select("id")
    .single()

  if (topicErr) throw new Error(topicErr.message)

  return saveTopicMapping(
    userId,
    tec_subject,
    tec_topic,
    topic.id,
    subject_id
  )
}

export async function resolveQuestionMapping(
  userId: string,
  tecSubject: string | null,
  tecTopic: string | null
): Promise<{ subject_id: string | null; topic_id: string | null }> {
  if (!tecSubject) return { subject_id: null, topic_id: null }

  const mappings = await loadMappings(userId)
  const sub = mappings.find(
    (m) =>
      isSubjectLevelMapping(m.tec_topic) &&
      normKey(m.tec_subject) === normKey(tecSubject)
  )
  let subject_id = sub?.subject_id ?? null

  if (tecTopic) {
    const top = mappings.find(
      (m) =>
        !isSubjectLevelMapping(m.tec_topic) &&
        normKey(m.tec_subject) === normKey(tecSubject) &&
        normKey(m.tec_topic) === normKey(tecTopic)
    )
    if (top) {
      return { subject_id: top.subject_id, topic_id: top.topic_id }
    }

    if (subject_id) {
      const { data: topics } = await supabaseServer
        .from("topics")
        .select("id, name")
        .eq("user_id", userId)
        .eq("subject_id", subject_id)
      const match = (topics ?? []).find(
        (t) => normKey(t.name) === normKey(tecTopic)
      )
      return { subject_id, topic_id: match?.id ?? null }
    }
  }

  return { subject_id, topic_id: null }
}

/** Progresso de mapeamento por matéria TEC. */
export async function getMappingProgress(userId: string): Promise<
  {
    tec_subject: string
    total_topics: number
    mapped_topics: number
    subject_mapped: boolean
  }[]
> {
  const { data: questions } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic")

  const topicSets = new Map<string, Set<string>>()
  for (const q of questions ?? []) {
    const sub = normKey(q.tec_subject ?? "")
    const top = normKey(q.tec_topic ?? "")
    if (!sub || !top) continue
    if (assessTecFacetQuality(top) === "hidden") continue
    const set = topicSets.get(sub) ?? new Set<string>()
    set.add(top)
    topicSets.set(sub, set)
  }

  const mappings = await loadMappings(userId)
  const mappedSubjects = new Set(
    mappings
      .filter((m) => isSubjectLevelMapping(m.tec_topic))
      .map((m) => normKey(m.tec_subject))
  )
  const mappedTopics = new Set(
    mappings
      .filter((m) => !isSubjectLevelMapping(m.tec_topic))
      .map((m) => `${normKey(m.tec_subject)}|||${normKey(m.tec_topic)}`)
  )

  return [...topicSets.entries()]
    .map(([tec_subject, topics]) => ({
      tec_subject,
      total_topics: topics.size,
      mapped_topics: [...topics].filter((t) =>
        mappedTopics.has(`${tec_subject}|||${t}`)
      ).length,
      subject_mapped: mappedSubjects.has(tec_subject),
    }))
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

export async function listMappedTopics(userId: string) {
  const mappings = await loadMappings(userId)
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)
  const { data: topics } = await supabaseServer
    .from("topics")
    .select("id, name, subject_id")
    .eq("user_id", userId)

  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const topicNames = new Map((topics ?? []).map((t) => [t.id, t.name]))

  return mappings
    .map((m) => ({
      id: m.id,
      tec_subject: m.tec_subject,
      tec_topic: m.tec_topic ?? "",
      is_subject_level: isSubjectLevelMapping(m.tec_topic),
      subject_id: m.subject_id,
      subject_name: subjectNames.get(m.subject_id) ?? null,
      topic_id: m.topic_id,
      topic_name: m.topic_id ? topicNames.get(m.topic_id) ?? null : null,
    }))
    .sort(
      (a, b) =>
        a.tec_subject.localeCompare(b.tec_subject, "pt-BR") ||
        (a.tec_topic ?? "").localeCompare(b.tec_topic ?? "", "pt-BR")
    )
}

/** Mapeia assuntos cujo nome coincide com tema existente na matéria vinculada. */
export async function bulkMapTopicsByName(
  userId: string,
  tec_subject: string
): Promise<{ mapped: number; skipped: number }> {
  const unmapped = await listUnmappedTecTopics(userId)
  const forSubject = unmapped.filter(
    (t) => normKey(t.tec_subject) === normKey(tec_subject) && t.mapped_subject_id
  )
  if (!forSubject.length) return { mapped: 0, skipped: 0 }

  const subjectId = forSubject[0].mapped_subject_id!
  const { data: topics } = await supabaseServer
    .from("topics")
    .select("id, name")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  let mapped = 0
  let skipped = 0
  for (const item of forSubject) {
    const match = (topics ?? []).find(
      (t) => normKey(t.name) === normKey(item.tec_topic)
    )
    if (!match) {
      skipped++
      continue
    }
    await saveTopicMapping(userId, item.tec_subject, item.tec_topic, match.id)
    mapped++
  }
  return { mapped, skipped }
}

/** Assuntos pendentes agrupados pela matéria TEC. */
export async function listUnmappedTecTopicsGrouped(
  userId: string
): Promise<{ tec_subject: string; topics: TecTopicGroup[] }[]> {
  const flat = await listUnmappedTecTopics(userId)
  const map = new Map<string, TecTopicGroup[]>()
  for (const t of flat) {
    const list = map.get(t.tec_subject) ?? []
    list.push(t)
    map.set(t.tec_subject, list)
  }
  return [...map.entries()]
    .map(([tec_subject, topics]) => ({
      tec_subject,
      topics: topics.sort((a, b) =>
        a.tec_topic.localeCompare(b.tec_topic, "pt-BR")
      ),
    }))
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

/** @deprecated use listUnmappedTecSubjects + listUnmappedTecTopics */
export async function listUnmappedPairs(userId: string) {
  return listUnmappedTecSubjects(userId)
}

export async function listAllTecSubjectsOverview(
  userId: string
): Promise<TecSubjectOverview[]> {
  const { data: questions } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic, statement")

  const mappings = await loadMappings(userId)
  const subjectLevelByTec = new Map<string, { subject_id: string }>()
  for (const m of mappings.filter((x) => isSubjectLevelMapping(x.tec_topic))) {
    subjectLevelByTec.set(normKey(m.tec_subject), { subject_id: m.subject_id })
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)
  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const summaries = await listTecSubjectSummaries(userId)
  const hasTreeMap = new Map(
    summaries.map((s) => [normKey(s.tec_subject), s.has_tree])
  )

  const mappedTopics = new Set(
    mappings
      .filter((m) => !isSubjectLevelMapping(m.tec_topic))
      .map((m) => `${normKey(m.tec_subject)}|||${normKey(m.tec_topic)}`)
  )

  const groups = new Map<
    string,
    {
      count: number
      sample_statement: string
      topics: Set<string>
    }
  >()

  for (const q of questions ?? []) {
    const sub = normKey(q.tec_subject ?? "")
    if (!sub) continue
    const g = groups.get(sub) ?? {
      count: 0,
      sample_statement: "",
      topics: new Set<string>(),
    }
    g.count++
    if (!g.sample_statement && q.statement) {
      g.sample_statement = q.statement.slice(0, 280)
    }
    const top = normKey(q.tec_topic ?? "")
    if (top && assessTecFacetQuality(top) !== "hidden") {
      g.topics.add(top)
    }
    groups.set(sub, g)
  }

  return [...groups.entries()]
    .map(([tec_subject, g]) => {
      const sm = subjectLevelByTec.get(tec_subject)
      const mapped_subject_id = sm?.subject_id ?? null
      return {
        tec_subject,
        question_count: g.count,
        sample_statement: g.sample_statement,
        topics_preview: [...g.topics].slice(0, 5),
        subject_mapped: Boolean(mapped_subject_id),
        mapped_subject_id,
        mapped_subject_name: mapped_subject_id
          ? subjectNames.get(mapped_subject_id) ?? null
          : null,
        mapped_topics: [...g.topics].filter((t) =>
          mappedTopics.has(`${tec_subject}|||${t}`)
        ).length,
        total_topics: g.topics.size,
        has_tree: hasTreeMap.get(tec_subject) ?? false,
      }
    })
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

function findNodeInTree(nodes: TecSubjectNode[], id: string): TecSubjectNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const found = findNodeInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

export async function bulkMapTopicsToSubject(
  userId: string,
  topics: { tec_subject: string; tec_topic: string }[],
  subject_id: string,
  mode: BulkMapMode = "per_topic",
  singleTopicName?: string
): Promise<{ mapped: number; skipped: number }> {
  if (!topics.length) return { mapped: 0, skipped: 0 }

  let mapped = 0
  let skipped = 0

  if (mode === "single_topic" && singleTopicName?.trim()) {
    const { data: topic, error } = await supabaseServer
      .from("topics")
      .insert({
        user_id: userId,
        subject_id,
        name: singleTopicName.trim(),
      })
      .select("id")
      .single()

    if (error || !topic) throw new Error(error?.message ?? "Erro ao criar tema")

    for (const t of topics) {
      if (!t.tec_topic?.trim()) {
        skipped++
        continue
      }
      await saveTopicMapping(
        userId,
        t.tec_subject,
        t.tec_topic,
        topic.id,
        subject_id
      )
      mapped++
    }
    return { mapped, skipped }
  }

  const { data: existingTopics } = await supabaseServer
    .from("topics")
    .select("id, name")
    .eq("user_id", userId)
    .eq("subject_id", subject_id)

  for (const t of topics) {
    if (!t.tec_topic?.trim()) {
      skipped++
      continue
    }
    let topicId = (existingTopics ?? []).find(
      (row) => normKey(row.name) === normKey(t.tec_topic)
    )?.id

    if (!topicId) {
      const { data: created, error } = await supabaseServer
        .from("topics")
        .insert({
          user_id: userId,
          subject_id,
          name: t.tec_topic.trim(),
        })
        .select("id")
        .single()
      if (error || !created) {
        skipped++
        continue
      }
      topicId = created.id
    }

    await saveTopicMapping(
      userId,
      t.tec_subject,
      t.tec_topic,
      topicId,
      subject_id
    )
    mapped++
  }

  return { mapped, skipped }
}

export async function bulkMapFolderToSubject(
  userId: string,
  tec_subject: string,
  folder_node_id: string,
  subject_id: string,
  mode: BulkMapMode = "per_topic",
  singleTopicName?: string
): Promise<{ mapped: number; skipped: number }> {
  const tree = await fetchTecSubjectTree(userId, tec_subject)
  const allNodes = [...tree.nodes, ...tree.ungrouped]
  const folder = findNodeInTree(allNodes, folder_node_id)
  if (!folder || folder.node_type !== "folder") {
    throw new Error("Pasta não encontrada")
  }

  const topics = flattenFolderTopics(folder).map((t) => ({
    tec_subject: t.tec_subject,
    tec_topic: t.tec_topic,
  }))

  return bulkMapTopicsToSubject(
    userId,
    topics,
    subject_id,
    mode,
    singleTopicName ?? folder.name
  )
}

export async function suggestMapping(
  userId: string,
  tecSubject: string,
  tecTopic: string
): Promise<{ subject_id: string | null; topic_id: string | null }> {
  return resolveQuestionMapping(userId, tecSubject, tecTopic)
}
