import { supabaseServer } from "../supabase-server"
import { aiComplete, type AiCompleteResult } from "./client"
import { getUserAiCredentials } from "./user-credentials"

export type AgentType =
  | "report"
  | "brain"
  | "teacher"
  | "edital"
  | "strategy"
  | "execution"

export type RunAgentParams = {
  agentType: AgentType
  userId: string
  subjectId?: string | null
  examTargetId?: string | null
  systemPrompt: string
  userContent: string
  jsonMode?: boolean
  maxTokens?: number
  model?: string
  metadata?: Record<string, unknown>
  skipLlm?: boolean
}

export type RunAgentResult = {
  text: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  usedLlm: boolean
}

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const credentials = params.skipLlm ? null : await getUserAiCredentials(params.userId)

  if (!credentials) {
    return {
      text: "",
      model: "rule-based",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      usedLlm: false,
    }
  }

  let result: AiCompleteResult
  try {
    const defaultModel =
      params.model ??
      (params.agentType === "edital" && credentials.provider === "openai"
        ? "gpt-4o"
        : undefined)

    result = await aiComplete(
      {
        model: defaultModel,
        jsonMode: params.jsonMode,
        maxTokens: params.maxTokens ?? 2000,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
      },
      credentials
    )
  } catch (e) {
    await supabaseServer.from("ai_runs").insert({
      user_id: params.userId,
      agent_type: params.agentType,
      status: "error",
      metadata: {
        ...params.metadata,
        subject_id: params.subjectId,
        error: e instanceof Error ? e.message : "unknown",
      },
    })
    throw e
  }

  await supabaseServer.from("ai_runs").insert({
    user_id: params.userId,
    agent_type: params.agentType,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_estimate: result.costUsdEstimate,
    status: "ok",
    metadata: {
      ...params.metadata,
      subject_id: params.subjectId,
      exam_target_id: params.examTargetId,
      model: result.model,
    },
  })

  return {
    text: result.text,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsdEstimate,
    usedLlm: true,
  }
}
