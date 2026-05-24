import type { SubjectBrainState } from "../../coach-types"
import { runAgent } from "../run-agent"

const SYSTEM = `Você resume o estado cognitivo da matéria com base em estatísticas e relatório recente.
Responda JSON: { "summary_md": "2-3 parágrafos", "danger_topics_add": [], "trend": "melhorando|piorando|estagnado" }
Use APENAS os dados JSON.`

export async function runBrainNarrativeAgent(params: {
  userId: string
  subjectId: string
  state: SubjectBrainState
  context: Record<string, unknown>
}): Promise<{ summaryMd: string; trend?: string }> {
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
    skipLlm: false,
  })

  if (!result.usedLlm || !result.text) {
    return { summaryMd: "" }
  }

  try {
    const parsed = JSON.parse(result.text) as {
      summary_md?: string
      trend?: string
    }
    return {
      summaryMd: parsed.summary_md ?? "",
      trend: parsed.trend,
    }
  } catch {
    return { summaryMd: "" }
  }
}
