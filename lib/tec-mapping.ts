import { supabaseServer } from "./supabase-server"

export async function suggestMapping(
  userId: string,
  tecSubject: string,
  tecTopic: string
): Promise<{ subject_id: string | null; topic_id: string | null }> {
  const { data: existing } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("subject_id, topic_id")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .eq("tec_topic", tecTopic || "")
    .maybeSingle()

  if (existing) {
    return { subject_id: existing.subject_id, topic_id: existing.topic_id }
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .trim()

  const ns = norm(tecSubject)
  let subject_id: string | null = null
  for (const sub of subjects ?? []) {
    const n = norm(sub.name)
    if (n === ns || n.includes(ns) || ns.includes(n)) {
      subject_id = sub.id
      break
    }
  }

  let topic_id: string | null = null
  if (subject_id && tecTopic) {
    const { data: topics } = await supabaseServer
      .from("topics")
      .select("id, name")
      .eq("user_id", userId)
      .eq("subject_id", subject_id)

    const nt = norm(tecTopic)
    for (const t of topics ?? []) {
      const n = norm(t.name)
      if (n === nt || n.includes(nt) || nt.includes(n)) {
        topic_id = t.id
        break
      }
    }
  }

  return { subject_id, topic_id }
}

export async function listUnmappedPairs(userId: string): Promise<
  { tec_subject: string; tec_topic: string; count: number }[]
> {
  const { data: questions } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic")

  const { data: mappings } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("tec_subject, tec_topic")
    .eq("user_id", userId)

  const mapped = new Set(
    (mappings ?? []).map((m) => `${m.tec_subject}|||${m.tec_topic ?? ""}`)
  )

  const counts = new Map<string, number>()
  for (const q of questions ?? []) {
    const key = `${q.tec_subject ?? ""}|||${q.tec_topic ?? ""}`
    if (mapped.has(key)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()].map(([key, count]) => {
    const [tec_subject, tec_topic] = key.split("|||")
    return { tec_subject, tec_topic, count }
  })
}
