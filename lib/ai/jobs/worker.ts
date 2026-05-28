import { supabaseServer } from "../../supabase-server"
import type { NotebookReportStructured } from "../../coach-types"
import { generateNotebookReport } from "../notebook-report"
import { classifyWrongAttempts } from "../error-classifier"
import { persistReportExecutableActions } from "../report-action-drafts"
import { persistSubjectBrain } from "../subject-brain"
import { recomputeStrategicQueue } from "../strategic-queue"
import { generateDailyStudyPlan } from "../execution-plan"
import { generateRemediationDrafts } from "../remediation-drafts"
import {
  filterReportStructuredForSubject,
  resolveNotebookQuestionIdsBySubject,
} from "../notebook-subject-split"
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
        const bySubject = await resolveNotebookQuestionIdsBySubject(
          userId,
          notebookId
        )
        const subjectIdsInNotebook = [...bySubject.keys()]

        if (subjectIdsInNotebook.length > 0) {
          for (const subjectId of subjectIdsInNotebook) {
            const qids = bySubject.get(subjectId) ?? []
            const filtered = filterReportStructuredForSubject(
              report.structured,
              new Set(qids)
            )
            await generateRemediationDrafts({
              userId,
              subjectId,
              notebookId,
              structured: filtered,
              snapshot: report.snapshot,
            })
            draftsCreated += await persistReportExecutableActions({
              userId,
              subjectId,
              structured: filtered,
              reportModelUsed: report.modelUsed,
            })
          }
        } else if (nb?.subject_id) {
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
          subjects_in_notebook: subjectIdsInNotebook.length,
        })

        if (row?.id) {
          const brainTargets =
            subjectIdsInNotebook.length > 0
              ? subjectIdsInNotebook
              : nb?.subject_id
                ? [nb.subject_id]
                : []

          for (const subjectId of brainTargets) {
            const qids = bySubject.get(subjectId)
            await enqueueJob({
              userId,
              jobType: "brain_ingest_report",
              idempotencyKey: `brain:${row.id}:${subjectId}`,
              payload: {
                subject_id: subjectId,
                report_id: row.id,
                filter_question_ids: qids ?? [],
              },
              priority: 8,
            })
          }
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
        const filterQuestionIds = Array.isArray(payload.filter_question_ids)
          ? (payload.filter_question_ids as string[])
          : undefined

        let reportStructured: NotebookReportStructured | null = null
        if (filterQuestionIds?.length) {
          const { data: reportRow } = await supabaseServer
            .from("subject_notebook_reports")
            .select("structured")
            .eq("id", reportId)
            .maybeSingle()
          const full = (reportRow?.structured ??
            null) as NotebookReportStructured | null
          if (full) {
            reportStructured = filterReportStructuredForSubject(
              full,
              new Set(filterQuestionIds)
            )
          }
        }

        const brainResult = await persistSubjectBrain({
          userId,
          subjectId,
          reportId,
          reportStructured,
        })
        const state = brainResult.state
        await completeJob(job.id, {
          topics: Object.keys(state.topic_map).length,
          danger_count: state.danger_topics.length,
          llm_used: brainResult.usedLlm,
          report_merged: brainResult.reportMerged,
        })

        const recentWrongTopics = (
          reportStructured?.per_question_errors ?? []
        )
          .map((e) => e.tec_topic)
          .filter(Boolean) as string[]

        if (!recentWrongTopics.length) {
          const { data: reportRow } = await supabaseServer
            .from("subject_notebook_reports")
            .select("structured")
            .eq("id", reportId)
            .maybeSingle()
          const structured = reportRow?.structured as
            | { per_question_errors?: { tec_topic: string }[] }
            | undefined
          recentWrongTopics.push(
            ...(structured?.per_question_errors ?? [])
              .map((e) => e.tec_topic)
              .filter(Boolean) as string[]
          )
        }

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
            enqueue_execution: Boolean(payload.enqueue_execution),
          },
          priority: 5,
        })
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

        if (payload.enqueue_execution) {
          await enqueueJob({
            userId,
            jobType: "execution_plan_today",
            idempotencyKey: `daily_plan:${userId}:${new Date().toISOString().slice(0, 10)}`,
            payload: {
              force: false,
              refresh_queue: false,
              recent_wrong_topics: Array.isArray(payload.recent_wrong_topics)
                ? (payload.recent_wrong_topics as string[])
                : undefined,
            },
            priority: 6,
          })
        }
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
