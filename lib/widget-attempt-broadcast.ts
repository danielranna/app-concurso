import { widgetQuestionTopic } from "./widget-question-live"

export type WidgetAttemptNotice = {
  id: string
  is_correct: boolean
  duration_ms: number
  created_at: string
}

/** Avisa o widget sem atrasar a gravação da resposta. Falha aqui não desfaz a tentativa. */
export function notifyWidgetAttempt(userId: string, notice: WidgetAttemptNotice): void {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return

  void fetch(`${base}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: widgetQuestionTopic(userId),
          event: "attempt",
          payload: notice,
        },
      ],
    }),
  }).catch(() => {})
}
