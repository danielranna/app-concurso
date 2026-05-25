import type { ErrorTaxonomy, PerQuestionError, TeacherCitation } from "../coach-types"
import { ERROR_TAXONOMY_LABELS } from "../coach-labels"
import { supabaseServer } from "../supabase-server"
import { topicBrainKey } from "./brain-helpers"
import { getTeacherDailyCap } from "./context-builder"
import type { WrongAttemptRow } from "./error-classifier"
import { runTeacherAgent, countTeacherQueriesToday } from "./agents/teacher"
import { buildTeacherQueryForError } from "./teacher-retrieval"

export type PreparedWrongItem = {
  row: WrongAttemptRow
  item: PerQuestionError
  errorDetail: Record<string, unknown>
}

type TopicGroup = {
  topicKey: string
  displayTopic: string
  items: PreparedWrongItem[]
  maxPriority: number
  dominantTaxonomy: ErrorTaxonomy
}

function dominantTaxonomy(items: PreparedWrongItem[]): ErrorTaxonomy {
  const counts = new Map<ErrorTaxonomy, number>()
  for (const { item } of items) {
    counts.set(item.error_taxonomy, (counts.get(item.error_taxonomy) ?? 0) + 1)
  }
  let best: ErrorTaxonomy = items[0]!.item.error_taxonomy
  let max = 0
  for (const [t, c] of counts) {
    if (c > max) {
      max = c
      best = t
    }
  }
  return best
}

function buildGroupQuery(group: TopicGroup): string {
  const statements = group.items
    .slice(0, 3)
    .map((p, i) => `Q${i + 1}: ${p.row.statement.slice(0, 400)}`)
    .join("\n")
  const taxLabel =
    ERROR_TAXONOMY_LABELS[group.dominantTaxonomy] ?? group.dominantTaxonomy

  return [
    `Tópico: ${group.displayTopic}`,
    `Padrão de erro: ${taxLabel}`,
    `${group.items.length} questão(ões) errada(s) neste assunto.`,
    statements,
    "Explique o conceito e o padrão de erro para revisão, citando material quando houver.",
  ].join("\n")
}

function toCitations(
  raw: { document_title: string; excerpt: string; page?: number | null }[]
): TeacherCitation[] {
  return raw.map((c) => ({
    document_title: c.document_title,
    excerpt: c.excerpt,
    page: c.page ?? null,
  }))
}

export async function applyGroupedTeacherExplanations(
  userId: string,
  subjectId: string,
  prepared: PreparedWrongItem[],
  options?: { explain?: boolean }
): Promise<void> {
  if (options?.explain === false || !prepared.length) return

  const cap = await getTeacherDailyCap(userId)
  let used = await countTeacherQueriesToday(userId)
  if (used >= cap) return

  const byTopic = new Map<string, TopicGroup>()

  for (const p of prepared) {
    const key = topicBrainKey(p.row.tec_topic)
    const existing = byTopic.get(key)
    if (existing) {
      existing.items.push(p)
      existing.maxPriority = Math.max(existing.maxPriority, p.row.priority_score)
      if (!existing.displayTopic && p.row.tec_topic) {
        existing.displayTopic = p.row.tec_topic
      }
    } else {
      byTopic.set(key, {
        topicKey: key,
        displayTopic: p.row.tec_topic,
        items: [p],
        maxPriority: p.row.priority_score,
        dominantTaxonomy: p.item.error_taxonomy,
      })
    }
  }

  for (const g of byTopic.values()) {
    g.dominantTaxonomy = dominantTaxonomy(g.items)
  }

  const groups = [...byTopic.values()].sort((a, b) => b.maxPriority - a.maxPriority)

  for (const group of groups) {
    if (used >= cap) break

    const userQuery = buildGroupQuery(group)
    const retrievalQuery = buildTeacherQueryForError({
      tec_topic: group.displayTopic,
      error_taxonomy: group.dominantTaxonomy,
      statementSnippet: group.items[0]?.row.statement,
    })

    const teacher = await runTeacherAgent({
      userId,
      subjectId,
      query: userQuery,
      retrievalQuery,
      purpose: "report_explain",
      mode: "report",
      questionContext: {
        topic: group.displayTopic,
        topic_key: group.topicKey,
        error_count: group.items.length,
        taxonomies: [...new Set(group.items.map((p) => p.item.error_taxonomy))],
        question_ids: group.items.map((p) => p.item.question_id),
      },
    })
    used++

    const citations = toCitations(teacher.citations ?? [])
    const groupSize = group.items.length

    for (const p of group.items) {
      p.item.explanation = teacher.answer
      p.item.explanation_source = teacher.source
      p.item.explanation_citations =
        citations.length > 0 ? citations : undefined
      p.item.topic_explanation_key = group.topicKey
      p.item.topic_group_size = groupSize

      await supabaseServer
        .from("question_attempts")
        .update({
          error_detail: {
            ...p.errorDetail,
            explanation: teacher.answer,
            explanation_source: teacher.source,
            explanation_citations: citations,
            topic_explanation_key: group.topicKey,
            topic_group_size: groupSize,
          },
        })
        .eq("id", p.row.attempt_id)
    }
  }
}
