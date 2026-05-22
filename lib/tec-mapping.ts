import { supabaseServer } from "./supabase-server"

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
  return data
}

export async function saveTopicMapping(
  userId: string,
  tec_subject: string,
  tec_topic: string,
  topic_id: string
) {
  const mappings = await loadMappings(userId)
  const subjectMapping = mappings.find(
    (m) =>
      isSubjectLevelMapping(m.tec_topic) &&
      normKey(m.tec_subject) === normKey(tec_subject)
  )
  if (!subjectMapping) {
    throw new Error(
      "Vincule primeiro a matéria TEC à sua matéria antes de associar o assunto."
    )
  }

  const { data, error } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .upsert(
      {
        user_id: userId,
        tec_subject: tec_subject.trim(),
        tec_topic: tec_topic.trim(),
        subject_id: subjectMapping.subject_id,
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
  tec_topic: string
) {
  const mappings = await loadMappings(userId)
  const subjectMapping = mappings.find(
    (m) =>
      isSubjectLevelMapping(m.tec_topic) &&
      normKey(m.tec_subject) === normKey(tec_subject)
  )
  if (!subjectMapping) {
    throw new Error("Vincule a matéria TEC antes de criar o tema.")
  }

  const { data: topic, error: topicErr } = await supabaseServer
    .from("topics")
    .insert({
      user_id: userId,
      subject_id: subjectMapping.subject_id,
      name: tec_topic.trim(),
    })
    .select("id")
    .single()

  if (topicErr) throw new Error(topicErr.message)

  return saveTopicMapping(userId, tec_subject, tec_topic, topic.id)
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
  const subject_id = sub?.subject_id ?? null

  let topic_id: string | null = null
  if (tecTopic && subject_id) {
    const top = mappings.find(
      (m) =>
        !isSubjectLevelMapping(m.tec_topic) &&
        normKey(m.tec_subject) === normKey(tecSubject) &&
        normKey(m.tec_topic) === normKey(tecTopic)
    )
    topic_id = top?.topic_id ?? null

    if (!topic_id) {
      const { data: topics } = await supabaseServer
        .from("topics")
        .select("id, name")
        .eq("user_id", userId)
        .eq("subject_id", subject_id)
      const match = (topics ?? []).find(
        (t) => normKey(t.name) === normKey(tecTopic)
      )
      topic_id = match?.id ?? null
    }
  }

  return { subject_id, topic_id }
}

/** Assuntos pendentes agrupados pela matéria TEC (hierarquia do PDF). */
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

export async function suggestMapping(
  userId: string,
  tecSubject: string,
  tecTopic: string
): Promise<{ subject_id: string | null; topic_id: string | null }> {
  return resolveQuestionMapping(userId, tecSubject, tecTopic)
}
