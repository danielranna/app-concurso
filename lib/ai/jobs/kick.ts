import { after } from "next/server"
import { runJobWorker } from "./worker"

export async function kickQuestionAiWorker(userId: string) {
  try {
    await runJobWorker(5, {
      userId,
      jobTypes: ["question_resolve_ai", "notebook_report_aggregate"],
    })
  } catch (e) {
    console.warn("[jobs] kick:", e instanceof Error ? e.message : e)
  }
}

export function scheduleQuestionAiKick(userId: string) {
  after(() => kickQuestionAiWorker(userId))
}
