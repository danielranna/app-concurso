import { supabaseServer } from "../supabase-server"
import type { NotebookReportStructured } from "../coach-types"
import { aiComplete, hasAiProvider } from "./client"

function unwrapQuestion(
  q: { tec_id: number; tec_topic: string; statement: string } | { tec_id: number; tec_topic: string; statement: string }[] | null
) {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

const NOTEBOOK_REPORT_SYSTEM = `Você é o Agente Relatório de Caderno. Analisa desempenho após conclusão de um caderno de questões.
Priorize: (1) tópicos fracos, (2) padrões metacognitivos (6 categorias), (3) tempo por tópico e por questão,
(4) reincidência de erros, (5) consolidação. Cite tec_topic exatamente como no JSON.
Use APENAS os dados do JSON; não invente estatísticas. Responda em português (BR).`

function buildRuleBasedReport(snapshot: Record<string, unknown>): NotebookReportStructured {
  const byTopic = (snapshot.by_topic as { topic: string; wrong: number; correct: number }[]) ?? []
  const weak = [...byTopic].sort((a, b) => b.wrong - a.wrong).slice(0, 5)
  const strong = [...byTopic].filter((t) => t.wrong === 0 && t.correct > 0).slice(0, 3)
  const recurring = (snapshot.recurring_failures as { tec_id: number; attempts: number }[]) ?? []

  return {
    headline: weak[0]
      ? `Foco em ${weak[0].topic}: ${weak[0].wrong} erros registrados neste caderno.`
      : "Caderno concluído — bom desempenho geral.",
    strengths: strong.map((t) => ({
      topic: t.topic,
      evidence: `${t.correct} acertos sem erros no período analisado.`,
    })),
    weaknesses: weak
      .filter((t) => t.wrong > 0)
      .map((t) => ({
        topic: t.topic,
        evidence: `${t.wrong} erros`,
        severity: t.wrong >= 5 ? "alta" : t.wrong >= 2 ? "media" : "baixa",
      })),
    time_insights: [],
    metacognition_patterns: (
      (snapshot.outcome_breakdown as { outcome: string; count: number }[]) ?? []
    )
      .filter((o) => o.count > 0)
      .map((o) => ({
        pattern: o.outcome,
        count: o.count,
        advice: "Revise com caderno de reforço ou mapa de erros.",
      })),
    recurring_failures: recurring.map((r) => ({
      tec_id: r.tec_id,
      attempts: r.attempts,
      advice: "Incluir no caderno de reforço.",
    })),
    consolidated_topics: strong.map((t) => t.topic),
    actions_next_7_days: [
      {
        action: weak[0] ? `Reforçar ${weak[0].topic}` : "Manter ritmo de estudo",
        priority: 1,
        minutes_estimate: 45,
      },
    ],
    executable_actions: weak[0]
      ? [
          {
            type: "create_remediation_notebook",
            label: `Criar caderno de reforço (${weak[0].topic})`,
            params: {
              source_notebook_id: snapshot.notebook_id,
              tec_topics: [weak[0].topic],
              min_wrong_attempts: 1,
              suggested_name: `Reforço - ${weak[0].topic}`,
            },
            priority: 1,
            estimated_minutes: 45,
          },
        ]
      : [],
    confidence_in_analysis: hasAiProvider() ? "media" : "alta",
  }
}

export async function buildNotebookReportSnapshot(
  notebookId: string,
  userId: string
) {
  const { data: nb, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id, name, subject_id, question_count, study_elapsed_ms, completed_at")
    .eq("id", notebookId)
    .eq("user_id", userId)
    .single()

  if (nbErr || !nb) throw new Error("Caderno não encontrado")

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, duration_ms, outcome_category, confidence_level, created_at,
      questions ( tec_id, tec_subject, tec_topic, statement )
    `
    )
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: true })

  type AttemptRow = NonNullable<typeof attempts>[number]
  const byQuestion = new Map<string, AttemptRow[]>()
  for (const a of attempts ?? []) {
    const list = byQuestion.get(a.question_id) ?? []
    list.push(a)
    byQuestion.set(a.question_id, list)
  }

  const byTopic = new Map<string, { correct: number; wrong: number; durations: number[] }>()
  const outcomeCounts = new Map<string, number>()
  const recurring: { tec_id: number; attempts: number }[] = []
  const timelines: Record<string, unknown>[] = []

  for (const [qid, rows] of byQuestion) {
    const last = rows[rows.length - 1]!
    const q = unwrapQuestion(
      last.questions as Parameters<typeof unwrapQuestion>[0]
    )
    const topic = q?.tec_topic?.trim() || "Sem tópico"
    const g = byTopic.get(topic) ?? { correct: 0, wrong: 0, durations: [] }
    if (last.is_correct) g.correct++
    else g.wrong++
    if (last.duration_ms) g.durations.push(last.duration_ms)
    byTopic.set(topic, g)

    for (const r of rows) {
      const oc = r.outcome_category ?? "unknown"
      outcomeCounts.set(oc, (outcomeCounts.get(oc) ?? 0) + 1)
    }

    const wrongCount = rows.filter((r) => !r.is_correct).length
    if (wrongCount >= 2 && q) {
      recurring.push({ tec_id: q.tec_id, attempts: wrongCount })
    }

    if (rows.length >= 2) {
      timelines.push({
        question_id: qid,
        tec_id: q?.tec_id,
        attempts_count: rows.length,
        wrong_count: wrongCount,
        attempts_timeline: rows.slice(-5).map((r) => ({
          at: r.created_at,
          duration_sec: Math.round((r.duration_ms ?? 0) / 1000),
          outcome: r.outcome_category,
          correct: r.is_correct,
        })),
      })
    }
  }

  let subjectName = ""
  if (nb.subject_id) {
    const { data: sub } = await supabaseServer
      .from("subjects")
      .select("name")
      .eq("id", nb.subject_id)
      .single()
    subjectName = sub?.name ?? ""
  }

  const { data: notes } = await supabaseServer
    .from("question_notes")
    .select("content, questions!inner(tec_id)")
    .eq("user_id", userId)
    .limit(10)

  return {
    notebook_id: notebookId,
    notebook_name: nb.name,
    subject_id: nb.subject_id,
    subject_name: subjectName,
    question_count: nb.question_count,
    study_elapsed_ms: nb.study_elapsed_ms,
    completed_at: nb.completed_at,
    by_topic: [...byTopic.entries()].map(([topic, g]) => ({
      topic,
      correct: g.correct,
      wrong: g.wrong,
      avg_duration_ms: g.durations.length
        ? Math.round(g.durations.reduce((s, d) => s + d, 0) / g.durations.length)
        : 0,
    })),
    outcome_breakdown: [...outcomeCounts.entries()].map(([outcome, count]) => ({
      outcome,
      count,
    })),
    recurring_failures: recurring.sort((a, b) => b.attempts - a.attempts).slice(0, 15),
    multi_attempt_questions: timelines.slice(0, 15),
    notes_sample: (notes ?? []).map((n) => ({
      content: String(n.content ?? "").slice(0, 200),
    })),
  }
}

export async function generateNotebookReport(
  notebookId: string,
  userId: string
): Promise<{
  structured: NotebookReportStructured
  summaryMd: string
  snapshot: Record<string, unknown>
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}> {
  const snapshot = await buildNotebookReportSnapshot(notebookId, userId)

  let structured = buildRuleBasedReport(snapshot)

  let summaryMd = `## ${snapshot.notebook_name}\n\n${structured.headline}\n\n`
  let modelUsed = "rule-based"
  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0

  if (hasAiProvider()) {
    try {
      const jsonResult = await aiComplete({
        jsonMode: true,
        maxTokens: 2500,
        messages: [
          { role: "system", content: NOTEBOOK_REPORT_SYSTEM },
          {
            role: "user",
            content: `Gere análise JSON do caderno:\n${JSON.stringify(snapshot)}`,
          },
        ],
      })
      const parsed = JSON.parse(jsonResult.text) as NotebookReportStructured
      if (parsed.headline) structured = parsed
      modelUsed = jsonResult.model
      tokensIn = jsonResult.tokensIn
      tokensOut = jsonResult.tokensOut
      costUsd = jsonResult.costUsdEstimate

      const mdResult = await aiComplete({
        maxTokens: 1500,
        messages: [
          {
            role: "system",
            content:
              "Escreva relatório em markdown (600-900 palavras) em português BR com seções: Resumo, Pontos fortes, Pontos fracos, Tempo, Plano 7 dias.",
          },
          {
            role: "user",
            content: JSON.stringify(structured),
          },
        ],
      })
      if (mdResult.text) summaryMd = mdResult.text
      tokensIn += mdResult.tokensIn
      tokensOut += mdResult.tokensOut
      costUsd += mdResult.costUsdEstimate
    } catch {
      summaryMd += structured.weaknesses
        .map((w) => `- **${w.topic}**: ${w.evidence}`)
        .join("\n")
    }
  } else {
    summaryMd += structured.weaknesses
      .map((w) => `- **${w.topic}**: ${w.evidence}`)
      .join("\n")
  }

  return {
    structured,
    summaryMd,
    snapshot: snapshot as Record<string, unknown>,
    modelUsed,
    tokensIn,
    tokensOut,
    costUsd,
  }
}

export async function enqueueNotebookReport(notebookId: string, userId: string) {
  const { data: existing } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id")
    .eq("notebook_id", notebookId)
    .maybeSingle()

  if (existing) return { skipped: true, reason: "already_exists" }

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("subject_id, completed_at")
    .eq("id", notebookId)
    .single()

  if (!nb?.completed_at) return { skipped: true, reason: "not_completed" }

  const report = await generateNotebookReport(notebookId, userId)

  const { data: row, error } = await supabaseServer
    .from("subject_notebook_reports")
    .insert({
      user_id: userId,
      subject_id: nb.subject_id,
      notebook_id: notebookId,
      summary_md: report.summaryMd,
      structured: report.structured,
      input_snapshot: report.snapshot,
      model_used: report.modelUsed,
      tokens_in: report.tokensIn,
      tokens_out: report.tokensOut,
      cost_usd_estimate: report.costUsd,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  await supabaseServer
    .from("notebooks")
    .update({ report_pending: false })
    .eq("id", notebookId)

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "notebook_report",
    tokens_in: report.tokensIn,
    tokens_out: report.tokensOut,
    cost_estimate: report.costUsd,
    status: "ok",
    metadata: { notebook_id: notebookId, report_id: row?.id },
  })

  for (const action of report.structured.executable_actions ?? []) {
    if (action.type !== "create_remediation_notebook") continue
    await supabaseServer.from("ai_action_drafts").insert({
      user_id: userId,
      subject_id: nb.subject_id,
      type: "notebook_create",
      label: action.label,
      payload: {
        ...action.params,
        subject_id: nb.subject_id,
        suggested_name: action.params.suggested_name ?? action.label,
      },
      source_agent: "notebook_report",
      status: "pending",
    })
  }

  return { report_id: row?.id, skipped: false }
}
