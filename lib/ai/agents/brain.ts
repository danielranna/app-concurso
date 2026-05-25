import type { SubjectBrainState } from "../../coach-types"
import { runAgent } from "../run-agent"
import type { BrainNarrativeLlm } from "../brain-helpers"

const SYSTEM = `Você resume o estado cognitivo da matéria com base em estatísticas e relatório recente.
Responda JSON: {
  "summary_md": "2-3 parágrafos em português",
  "danger_topics_add": ["tópicos extras de alerta, use nomes do topic_map"],
  "trend": "melhorando|piorando|estagnado|desconhecido"
}
Use APENAS os dados JSON. Não invente tópicos fora do contexto.`

export async function runBrainNarrativeAgent(params: {
  userId: string
  subjectId: string
  state: SubjectBrainState
  context: Record<string, unknown>
}): Promise<{
  summaryMd: string
  trend?: string
  danger_topics_add?: string[]
  usedLlm: boolean
}> {
  const result = await runAgent({
    agentType: "brain",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify({
      computed_state: params.state,
      context: params.context,
    }),
    jsonMode: true,
    maxTokens: 800,
  })

  if (!result.usedLlm || !result.text) {
    return { summaryMd: "", usedLlm: false }
  }

  try {
    const parsed = JSON.parse(result.text) as BrainNarrativeLlm
    return {
      summaryMd: parsed.summary_md ?? "",
      trend: parsed.trend,
      danger_topics_add: parsed.danger_topics_add,
      usedLlm: true,
    }
  } catch {
    return { summaryMd: "", usedLlm: true }
  }
}
