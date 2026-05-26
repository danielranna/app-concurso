import { supabaseServer } from "../../supabase-server"
import type { NotebookReportStructured } from "../../coach-types"
import { generateNotebookReport } from "../notebook-report"
import { classifyWrongAttempts } from "../error-classifier"
import { persistReportExecutableActions } from "../report-action-drafts"
import { persistSubjectBrain } from "../subject-brain"
import { recomputeStrategicQueue } from "../strategic-queue"
import { generateDailyStudyPlan } from "../execution-plan"
import {
  chunkDocument,
  embedDocumentChunks,
  ingestDocumentBatch,
  ingestDocumentPipeline,
  parseDocumentFromStorage,
} from "../document-ingest"
import { generateRemediationDrafts } from "../remediation-drafts"
import { claimPendingJobs, completeJob, enqueueJob, type JobType } from "./queue"

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
        const force = Boolean(payload.force)

        const { data: existing } = await supabaseServer
          .from("subject_notebook_reports")
          .select("id")
          .eq("notebook_id", notebookId)
          .maybeSingle()

        if (existing && !force) {
          await supabaseServer
            .from("notebooks")
            .update({ report_pending: false })
            .eq("id", notebookId)
          await completeJob(job.id, { skipped: true, report_id: existing.id })
          return
        }

        if (existing && force) {
          await supabaseServer
            .from("subject_notebook_reports")
            .delete()
            .eq("id", existing.id)
        }

        const report = await generateNotebookReport(notebookId, userId, { force })
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

        let draftsCreated = 0
        if (nb?.subject_id) {
          await generateRemediationDrafts({
            userId,
            subjectId: nb.subject_id,
            notebookId,
            structured: report.structured,
            snapshot: report.snapshot,
          })

          draftsCreated = await persistReportExecutableActions({
            userId,
            subjectId: nb.subject_id,
            structured: report.structured,
            reportModelUsed: report.modelUsed,
          })
        }

        await completeJob(job.id, {
          report_id: row!.id,
          llm_used: report.usedLlm,
          per_question_count: report.perQuestionCount,
          actions_count: report.structured.executable_actions?.length ?? 0,
          drafts_created: draftsCreated,
          topics_weak: report.structured.weaknesses?.length ?? 0,
        })

        if (nb?.subject_id && row?.id) {
          await enqueueJob({
            userId,
            jobType: "brain_ingest_report",
            idempotencyKey: `brain:${row.id}`,
            payload: { subject_id: nb.subject_id, report_id: row.id },
            priority: 8,
          })
        }
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
        const brainResult = await persistSubjectBrain({
          userId,
          subjectId,
          reportId,
        })
        const state = brainResult.state
        await completeJob(job.id, {
          topics: Object.keys(state.topic_map).length,
          danger_count: state.danger_topics.length,
          llm_used: brainResult.usedLlm,
          report_merged: brainResult.reportMerged,
        })

        const { data: reportRow } = await supabaseServer
          .from("subject_notebook_reports")
          .select("structured")
          .eq("id", reportId)
          .maybeSingle()
        const structured = reportRow?.structured as
          | { per_question_errors?: { tec_topic: string }[] }
          | undefined
        const recentWrongTopics = (structured?.per_question_errors ?? []).map(
          (e) => e.tec_topic
        )

        await enqueueJob({
          userId,
          jobType: "strategy_recompute",
          idempotencyKey: `strategy:${subjectId}:${new Date().toISOString().slice(0, 13)}`,
          payload: {
            subject_id: subjectId,
            recent_wrong_topics: recentWrongTopics,
            enqueue_execution: true,
          },
          priority: 7,
        })
        break
      }

      case "strategy_recompute": {
        const subjectId = payload.subject_id as string
        const recentWrongTopics = Array.isArray(payload.recent_wrong_topics)
          ? (payload.recent_wrong_topics as string[])
          : undefined
        const result = await recomputeStrategicQueue(userId, subjectId, {
          autoLlm: true,
          recentWrongTopics,
        })
        await completeJob(job.id, {
          items: result.rows.length,
          llm_used: result.llm_used,
          top_topic: result.top_topic,
          top_topic_label: result.top_topic_label,
          recent_boost_count: result.recent_boost_count,
          subject_priority: result.subject_priority,
          narrative: result.narrative ?? null,
        })

        await enqueueJob({
          userId,
          jobType: "strategy_recompute_all",
          idempotencyKey: `strategy_all:${userId}:${new Date().toISOString().slice(0, 10)}`,
          payload: {
            exclude_subject_id: subjectId,
            recent_wrong_topics: recentWrongTopics,
          },
          priority: 5,
        })

        if (payload.enqueue_execution) {
          await enqueueJob({
            userId,
            jobType: "execution_plan_today",
            idempotencyKey: `daily_plan:${userId}:${new Date().toISOString().slice(0, 10)}`,
            payload: {
              force: false,
              subject_id: subjectId,
              recent_wrong_topics: recentWrongTopics,
            },
            priority: 6,
          })
        }
        break
      }

      case "strategy_recompute_all": {
        const excludeSubjectId = payload.exclude_subject_id as string | undefined
        const { recomputeAllSubjectsQueue } = await import("../strategic-queue")
        const results = await recomputeAllSubjectsQueue(userId, {
          excludeSubjectId,
        })
        const totalItems = results.reduce((n, r) => n + r.rows.length, 0)
        await completeJob(job.id, {
          subjects: results.length,
          total_items: totalItems,
          top_subjects: results
            .slice(0, 5)
            .map((r) => ({
              subject_priority: r.subject_priority,
              top_topic_label: r.top_topic_label,
            })),
        })
        break
      }

      case "execution_plan_today": {
        const plan = await generateDailyStudyPlan(
          userId,
          Boolean(payload.force ?? false),
          {
            refreshQueue: Boolean(payload.refresh_queue),
            subjectId: payload.subject_id as string | undefined,
            recentWrongTopics: Array.isArray(payload.recent_wrong_topics)
              ? (payload.recent_wrong_topics as string[])
              : undefined,
            pin: payload.pin as boolean | undefined,
          }
        )
        await completeJob(job.id, {
          plan_id: plan.id,
          blocks: plan.blocks.length,
          user_pinned: plan.user_pinned ?? false,
        })
        break
      }

      case "document_parse": {
        const documentId = payload.document_id as string
        const parsed = await parseDocumentFromStorage(userId, documentId)
        await enqueueJob({
          userId,
          jobType: "document_chunk",
          idempotencyKey: `chunk:${documentId}:${Date.now()}`,
          payload: { document_id: documentId },
          priority: 4,
        })
        await completeJob(job.id, parsed)
        break
      }

      case "document_chunk": {
        const documentId = payload.document_id as string
        const chunked = await chunkDocument(userId, documentId)
        if (chunked.chunks > 0) {
          await enqueueJob({
            userId,
            jobType: "document_embed",
            idempotencyKey: `embed:${documentId}:${Date.now()}`,
            payload: { document_id: documentId },
            priority: 3,
          })
        } else {
          await completeJob(job.id, { chunks: 0, skipped_embed: true })
          break
        }
        await completeJob(job.id, chunked)
        break
      }

      case "document_embed": {
        const documentId = payload.document_id as string
        const emb = await embedDocumentChunks(userId, documentId)
        await supabaseServer
          .from("subject_documents")
          .update({
            ingest_stage: "ready",
            status: "ready",
            ingest_error: null,
          })
          .eq("id", documentId)
        await completeJob(job.id, { ...emb, ready: true })
        break
      }

      case "document_ingest": {
        const documentId = payload.document_id as string
        const result = await ingestDocumentPipeline(userId, documentId)
        await completeJob(job.id, result)
        break
      }

      case "document_batch_ingest": {
        const ids = Array.isArray(payload.document_ids)
          ? (payload.document_ids as string[])
          : []
        const batch = await ingestDocumentBatch(userId, ids, 2)
        await completeJob(job.id, batch)
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

export async function runJobWorker(
  limit = 5,
  options?: { userId?: string; jobTypes?: JobType[] }
) {
  const jobs = await claimPendingJobs(limit, options)
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
