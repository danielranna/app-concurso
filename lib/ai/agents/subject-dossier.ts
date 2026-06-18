import type { SubjectStudyDossierStructured } from "../../coach-types"
import { runAgent } from "../run-agent"
import type { SubjectDossierPayload } from "../subject-dossier-payload"
import { compactDossierPayloadForLlm } from "../subject-dossier-payload"
import { runAnnotationClarificationsAgent } from "./annotation-clarifications"

const SYSTEM = `Você é o "cérebro" do aluno nesta matéria — um tutor que escreve um relato de estudo personalizado em português do Brasil.

Use APENAS os dados JSON fornecidos. Não invente leis, artigos, conceitos ou questões fora do contexto.

TAREFA: produzir o Caderno da Matéria — síntese narrativa que:
1. Correlaciona equívocos entre tópicos (padrões de confusão recorrentes)
2. Explica o que o aluno precisa internalizar em cada lacuna crítica
3. Responde às anotações/dúvidas do aluno (annotation_clarifications) — use precomputed_clarifications quando existir; caso contrário, use cached_feedback e COMPLEMENTE com exemplos concretos
   - answer_md deve responder DIRETAMENTE à nota do aluno, ponto a ponto
   - Se a nota pedir exemplo numérico ou cenário ("vamos supor", "como fica"), inclua exemplo passo a passo com números
   - NÃO repita definição genérica de conceito sem ligar ao caso da questão e à dúvida específica
   - Se cached_feedback for vago, substitua por resposta específica
4. Destaca evoluções REAIS listadas em evolution_candidates — cite evidências factuais
5. Indica o que ainda precisa de atenção (still_attention)
6. Monta blocos de estudo (study_blocks) como mini-capítulos de revisão

Tom: direto, encorajador, como um professor falando com o aluno ("você", "seu").
Cada critical_theme deve ter evidence com question_ids reais do input.
Não repita o mesmo texto em opening_narrative e study_blocks.

Responda JSON:
{
  "headline": "frase de impacto",
  "opening_narrative": "2-4 parágrafos em markdown",
  "critical_themes": [{
    "theme": "nome do padrão de erro",
    "topics": ["tópicos TEC"],
    "why_it_matters": "por que isso importa na prova",
    "understanding_md": "explicação didática do que internalizar",
    "confusion_pairs": [{"wrong_belief": "...", "correct": "..."}],
    "evidence": [{"question_id": "uuid", "tec_id": 0, "tec_topic": "...", "specific_mistake": "...", "report_id": "uuid", "recurrence": 1}]
  }],
  "annotation_clarifications": [{
    "question_id": "uuid",
    "note_body": "cópia da nota",
    "answer_md": "resposta à dúvida",
    "linked_topics": ["..."]
  }],
  "evolutions": [{
    "topic": "...",
    "previous_misconception": "...",
    "current_status": "forte|dominado|...",
    "evidence": "fatos do evolution_candidates",
    "encouragement": "frase curta"
  }],
  "still_attention": [{"topic": "...", "reason": "...", "action": "..."}],
  "study_blocks": [{"title": "...", "content_md": "...", "question_ids": ["..."]}]
}`

export type SubjectDossierAgentResult = {
  structured: SubjectStudyDossierStructured
  narrativeMd: string
  usedLlm: boolean
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export async function runSubjectDossierAgent(params: {
  userId: string
  subjectId: string
  payload: SubjectDossierPayload
  skipLlm?: boolean
}): Promise<SubjectDossierAgentResult> {
  const annotationResult = await runAnnotationClarificationsAgent({
    userId: params.userId,
    subjectId: params.subjectId,
    payload: params.payload,
    skipLlm: params.skipLlm,
  })

  const compact = compactDossierPayloadForLlm(params.payload, {
    precomputed_clarifications: annotationResult.clarifications,
  })

  const result = await runAgent({
    agentType: "dossier",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify(compact),
    jsonMode: true,
    maxTokens: 4000,
    model: "gpt-4o",
    skipLlm: params.skipLlm,
    metadata: { phase: "subject_dossier" },
  })

  if (result.usedLlm && result.text) {
    try {
      const parsed = JSON.parse(result.text) as SubjectStudyDossierStructured
      const narrativeMd = [
        parsed.headline,
        "",
        parsed.opening_narrative,
      ].join("\n")
      return {
        structured: normalizeDossierStructured(
          parsed,
          params.payload,
          annotationResult.clarifications
        ),
        narrativeMd,
        usedLlm: true,
        modelUsed: result.model,
        tokensIn: result.tokensIn + annotationResult.tokensIn,
        tokensOut: result.tokensOut + annotationResult.tokensOut,
        costUsd: result.costUsd + annotationResult.costUsd,
      }
    } catch {
      /* fall through to rule-based */
    }
  }

  const fallback = buildRuleBasedDossier(
    params.payload,
    annotationResult.clarifications
  )
  return {
    ...fallback,
    usedLlm: annotationResult.usedLlm,
    modelUsed: annotationResult.usedLlm
      ? annotationResult.modelUsed
      : "rule-based",
    tokensIn: annotationResult.tokensIn,
    tokensOut: annotationResult.tokensOut,
    costUsd: annotationResult.costUsd,
  }
}

function normalizeDossierStructured(
  raw: SubjectStudyDossierStructured,
  payload: SubjectDossierPayload,
  precomputedClarifications?: SubjectStudyDossierStructured["annotation_clarifications"]
): SubjectStudyDossierStructured {
  const errorByQ = new Map(payload.aggregated_errors.map((e) => [e.question_id, e]))

  const llmClarifications = (raw.annotation_clarifications ?? []).slice(0, 15)
  const precomputedByQ = new Map(
    (precomputedClarifications ?? []).map((c) => [c.question_id, c])
  )
  const mergedClarifications =
    precomputedClarifications && precomputedClarifications.length > 0
      ? precomputedClarifications.map((pre) => {
          const fromLlm = llmClarifications.find(
            (c) => c.question_id === pre.question_id
          )
          return {
            ...pre,
            answer_md:
              pre.answer_md?.trim().length > 80
                ? pre.answer_md
                : fromLlm?.answer_md?.trim() || pre.answer_md,
          }
        })
      : llmClarifications

  return {
    headline: raw.headline?.trim() || `Caderno da matéria: ${payload.subject_name}`,
    opening_narrative: raw.opening_narrative?.trim() || "",
    critical_themes: (raw.critical_themes ?? []).slice(0, 8).map((t) => ({
      ...t,
      evidence: (t.evidence ?? []).map((ev) => {
        const src = errorByQ.get(ev.question_id)
        return {
          question_id: ev.question_id,
          tec_id: ev.tec_id ?? src?.tec_id,
          tec_topic: ev.tec_topic ?? src?.tec_topic,
          specific_mistake: ev.specific_mistake ?? src?.specific_mistake,
          report_id: ev.report_id ?? src?.report_ids[0] ?? "",
          recurrence: ev.recurrence ?? src?.recurrence ?? 1,
        }
      }),
    })),
    annotation_clarifications: mergedClarifications,
    evolutions: (raw.evolutions ?? []).slice(0, 10),
    still_attention: (raw.still_attention ?? []).slice(0, 10),
    study_blocks: (raw.study_blocks ?? []).slice(0, 8),
  }
}

export function buildRuleBasedDossier(
  payload: SubjectDossierPayload,
  precomputedClarifications?: SubjectStudyDossierStructured["annotation_clarifications"]
): { structured: SubjectStudyDossierStructured; narrativeMd: string } {
  const byTopic = new Map<string, typeof payload.aggregated_errors>()
  for (const e of payload.aggregated_errors) {
    const topic = e.tec_topic?.trim() || "Sem tópico"
    const list = byTopic.get(topic) ?? []
    list.push(e)
    byTopic.set(topic, list)
  }

  const critical_themes = [...byTopic.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([topic, errors]) => ({
      theme: `Lacunas em ${topic}`,
      topics: [topic],
      why_it_matters: `Você registrou ${errors.length} questão(ões) com erro neste assunto.`,
      understanding_md: errors
        .map(
          (e) =>
            e.feedback_detailed ??
            e.misconception ??
            e.specific_mistake ??
            "Revise o conteúdo desta questão."
        )
        .slice(0, 3)
        .join("\n\n"),
      evidence: errors.map((e) => ({
        question_id: e.question_id,
        tec_id: e.tec_id,
        tec_topic: e.tec_topic,
        specific_mistake: e.specific_mistake,
        report_id: e.report_ids[0] ?? "",
        recurrence: e.recurrence,
      })),
    }))

  const annotation_clarifications =
    precomputedClarifications && precomputedClarifications.length > 0
      ? precomputedClarifications
      : payload.annotations
          .filter((a) => a.note_body.trim())
          .map((a) => ({
            question_id: a.question_id,
            note_body: a.note_body,
            answer_md:
              a.cached_feedback ??
              "Revise a explicação da questão no relatório do caderno ou adicione explicações com IA ao concluir o caderno.",
            linked_topics: a.tec_topic ? [a.tec_topic] : [],
          }))

  const evolutions = payload.evolution_candidates.map((c) => ({
    topic: c.topic,
    previous_misconception: c.previous_misconception,
    current_status: c.brain_status ?? "em evolução",
    evidence: `${c.solid_streak} acertos recentes com confiança (${c.last_outcomes.join(", ")})`,
    encouragement: "Continue consolidando com questões novas.",
  }))

  const dangerSet = new Set(payload.brain?.danger_topics ?? [])
  const still_attention = Object.entries(payload.brain?.topic_map ?? {})
    .filter(([k, e]) => dangerSet.has(k) || e.status === "critico" || e.status === "fraco")
    .slice(0, 8)
    .map(([k, e]) => ({
      topic: e.label ?? k,
      reason: e.last_insight ?? `Status: ${e.status}, domínio ${Math.round(e.dominio * 100)}%`,
      action: "Revise os blocos de estudo abaixo e resolva as questões de referência.",
    }))

  const study_blocks = critical_themes.map((t) => ({
    title: t.theme,
    content_md: t.understanding_md,
    question_ids: t.evidence.map((e) => e.question_id),
  }))

  const trend = payload.brain?.trend ?? "desconhecido"
  const opening_narrative = [
    `Este é seu **Caderno da Matéria** para ${payload.subject_name}, montado a partir dos relatórios dos seus cadernos.`,
    "",
    `Tendência geral: **${trend}**. Identificamos **${payload.aggregated_errors.length}** questões com explicação de erro registrada.`,
    evolutions.length
      ? `\nVocê já mostrou evolução em: ${evolutions.map((e) => e.topic).join(", ")}.`
      : "",
  ].join("\n")

  const headline = `Seu mapa de lacunas em ${payload.subject_name}`

  const structured: SubjectStudyDossierStructured = {
    headline,
    opening_narrative,
    critical_themes,
    annotation_clarifications,
    evolutions,
    still_attention,
    study_blocks,
  }

  const narrativeMd = [headline, "", opening_narrative].join("\n")

  return { structured, narrativeMd }
}
