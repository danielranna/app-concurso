import { runAgent } from "../run-agent"

const SYSTEM = `Você humaniza a fila estratégica de estudo. A ordenação numérica já está definida.
Cada item tem topic_key (chave normalizada) e topic_label (nome exibido). Use topic_key no JSON.
Para cada item do top 10, escreva um "why" curto em português (1-2 frases).
Responda JSON: { "items": [{"topic_key":"","why":""}], "narrative": "" }`

export async function runStrategyNarrativeAgent(params: {
  userId: string
  subjectId?: string
  queue: Record<string, unknown>[]
}): Promise<{ narrative: string; whys: Record<string, string> }> {
  const top = params.queue.slice(0, 10)
  const result = await runAgent({
    agentType: "strategy",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify({ queue: top }),
    jsonMode: true,
    maxTokens: 1000,
  })

  if (!result.usedLlm || !result.text) {
    return { narrative: "", whys: {} }
  }

  try {
    const parsed = JSON.parse(result.text) as {
      items?: { topic_key: string; why: string }[]
      narrative?: string
    }
    const whys: Record<string, string> = {}
    for (const item of parsed.items ?? []) {
      whys[item.topic_key] = item.why
    }
    return { narrative: parsed.narrative ?? "", whys }
  } catch {
    return { narrative: "", whys: {} }
  }
}
