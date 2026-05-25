import { supabaseServer } from "../supabase-server"
import type { ExecutableAction } from "../coach-types"

/** Persiste drafts apenas para ações que criam entidades; demais ficam no structured com href. */
export async function persistReportExecutableActions(params: {
  userId: string
  subjectId: string
  structured: { executable_actions?: ExecutableAction[] }
  reportModelUsed: string
}) {
  let created = 0
  for (const action of params.structured.executable_actions ?? []) {
    if (action.type === "create_remediation_notebook") {
      await supabaseServer.from("ai_action_drafts").insert({
        user_id: params.userId,
        subject_id: params.subjectId,
        type: "notebook_create",
        label: action.label,
        payload: {
          ...action.params,
          subject_id: params.subjectId,
          suggested_name: action.params.suggested_name ?? action.label,
          report_model_used: params.reportModelUsed,
        },
        source_agent: "notebook_report",
        status: "pending",
      })
      created++
      continue
    }

    if (action.type === "flashcard_create") {
      await supabaseServer.from("ai_action_drafts").insert({
        user_id: params.userId,
        subject_id: params.subjectId,
        type: "flashcard_create",
        label: action.label,
        payload: action.params,
        source_agent: "notebook_report",
        status: "pending",
      })
      created++
      continue
    }

    if (action.type === "error_create") {
      await supabaseServer.from("ai_action_drafts").insert({
        user_id: params.userId,
        subject_id: params.subjectId,
        type: "error_create",
        label: action.label,
        payload: action.params,
        source_agent: "notebook_report",
        status: "pending",
      })
      created++
    }
  }
  return created
}
