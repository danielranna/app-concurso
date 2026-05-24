import type { DailyStudyPlan } from "../../coach-types"
import { runAgent } from "../run-agent"

const SYSTEM = `Você redige um resumo motivacional do plano do dia (2-3 frases).
O plano em blocos já está definido — não altere contagens.
Responda JSON: { "narrative_summary": "" }`

export async function runExecutionNarrativeAgent(params: {
  userId: string
  plan: DailyStudyPlan
}): Promise<string> {
  const result = await runAgent({
    agentType: "execution",
    userId: params.userId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify(params.plan),
    jsonMode: true,
    maxTokens: 300,
  })

  if (!result.usedLlm || !result.text) return ""

  try {
    const parsed = JSON.parse(result.text) as { narrative_summary?: string }
    return parsed.narrative_summary ?? ""
  } catch {
    return ""
  }
}
