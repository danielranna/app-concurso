import { supabaseServer } from "../../supabase-server"
import type { NotebookReportStructured } from "../../coach-types"
import { buildRuleBasedReport, generateNotebookReport } from "../notebook-report"
import { classifyWrongAttempts } from "../error-classifier"
import { ingestBrainFromReport } from "../subject-brain"
import { recomputeStrategicQueue } from "../strategic-queue"
import { generateDailyStudyPlan } from "../execution-plan"
import { ingestDocumentChunks } from "../document-rag"
import { generateRemediationDrafts } from "../remediation-drafts"
import { claimPendingJobs, completeJob, enqueueJob } from "./queue"

export async function processJob(job: {
  id: string
  user_id: string
  job_type: string
  payload: Record<string, unknown>
}) {
  const userId = job.user_id
  const payload = job.payload

  try {
    switch (job.job_type) {
      case "notebook_report_aggregate": {
        const notebookId = payload.notebook_id as string
        const { data: existing } = await supabaseServer
          .from("subject_notebook_reports")
          .select("id")
          .eq("notebook_id", notebookId)
          .maybeSingle()

        if (existing) {
          await completeJob(job.id, { skipped: true, report_id: existing.id })
          return
        }

        const report = await generateNotebookReport(notebookId, userId)
        const { data: nb } = await supabaseServer
          .from("notebooks")
          .select("subject_id")
          .eq("id", notebookId)
          .single()

        const { data: row, error } = await supabaseServer
          .from("subject_notebook_reports")
          .insert({
            user_id: userId,
            subject_id: nb?.subject_id,
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

        if (nb?.subject_id) {
          await generateRemediationDrafts({
            userId,
            subjectId: nb.subject_id,
            notebookId,
            structured: report.structured,
            snapshot: report.snapshot,
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
                report_model_used: report.modelUsed,
              },
              source_agent: "notebook_report",
              status: "pending",
            })
          }
        }

        await supabaseServer.from("ai_runs").insert({
          user_id: userId,
          agent_type: "notebook_report",
          tokens_in: report.tokensIn,
          tokens_out: report.tokensOut,
          cost_estimate: report.costUsd,
          status: "ok",
          metadata: { notebook_id: notebookId, report_id: row!.id },
        })

        await completeJob(job.id, { report_id: row!.id })

        await enqueueJob({
          userId,
          jobType: "classify_wrong_attempts",
          idempotencyKey: `classify:${notebookId}`,
          payload: {
            notebook_id: notebookId,
            subject_id: nb?.subject_id,
            report_id: row!.id,
          },
          priority: 9,
        })
        break
      }

      case "classify_wrong_attempts": {
        const notebookId = payload.notebook_id as string
        const subjectId = (payload.subject_id as string) || null
        const perQuestion = await classifyWrongAttempts(
          userId,
          notebookId,
          subjectId
        )

        const { data: report } = await supabaseServer
          .from("subject_notebook_reports")
          .select("id, structured")
          .eq("notebook_id", notebookId)
          .maybeSingle()

        if (report?.structured) {
          const structured = report.structured as NotebookReportStructured
          structured.per_question_errors = perQuestion
          await supabaseServer
            .from("subject_notebook_reports")
            .update({ structured })
            .eq("id", report.id)
        }

        await completeJob(job.id, { classified: perQuestion.length })

        const reportId =
          (payload.report_id as string | undefined) ?? report?.id
        if (subjectId && reportId) {
          await enqueueJob({
            userId,
            jobType: "brain_ingest_report",
            idempotencyKey: `brain:${reportId}`,
            payload: { subject_id: subjectId, report_id: reportId },
            priority: 8,
          })
        }
        break
      }

      case "brain_ingest_report": {
        const subjectId = payload.subject_id as string
        const reportId = payload.report_id as string
        const state = await ingestBrainFromReport(userId, subjectId, reportId)
        await completeJob(job.id, { topics: Object.keys(state.topic_map).length })

        await enqueueJob({
          userId,
          jobType: "strategy_recompute",
          idempotencyKey: `strategy:${subjectId}:${new Date().toISOString().slice(0, 13)}`,
          payload: { subject_id: subjectId },
          priority: 7,
        })

        await enqueueJob({
          userId,
          jobType: "execution_plan_today",
          idempotencyKey: `daily_plan:${userId}:${new Date().toISOString().slice(0, 10)}`,
          payload: { force: true },
          priority: 6,
        })
        break
      }

      case "strategy_recompute": {
        const subjectId = payload.subject_id as string
        const rows = await recomputeStrategicQueue(userId, subjectId, {
          withLlmNarrative: false,
        })
        await completeJob(job.id, { items: rows.length })
        break
      }

      case "execution_plan_today": {
        const plan = await generateDailyStudyPlan(
          userId,
          Boolean(payload.force)
        )
        await completeJob(job.id, { plan_id: plan.id, blocks: plan.blocks.length })
        break
      }

      case "document_ingest": {
        const documentId = payload.document_id as string
        const result = await ingestDocumentChunks(userId, documentId)
        await completeJob(job.id, result)
        break
      }

      default:
        await completeJob(job.id, null, `Unknown job type: ${job.job_type}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no job"
    await completeJob(job.id, null, msg)
    throw e
  }
}

export async function runJobWorker(limit = 5) {
  const jobs = await claimPendingJobs(limit)
  const results = []
  for (const job of jobs) {
    try {
      await processJob(job)
      results.push({ id: job.id, status: "done" })
    } catch (e) {
      results.push({
        id: job.id,
        status: "failed",
        error: e instanceof Error ? e.message : "error",
      })
    }
  }
  return results
}
