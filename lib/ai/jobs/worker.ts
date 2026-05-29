import { supabaseServer } from "../../supabase-server"
import type { NotebookReportStructured } from "../../coach-types"
import { createNotebookReportSync } from "../notebook-report"
import { classifyWrongAttempts } from "../error-classifier"
import { persistSubjectBrain } from "../subject-brain"
import { recomputeStrategicQueue } from "../strategic-queue"
import { generateDailyStudyPlan } from "../execution-plan"
import { filterReportStructuredForSubject } from "../notebook-subject-split"
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
        const result = await createNotebookReportSync(notebookId, userId, { force })
        if (result.skipped) {
          await completeJob(job.id, {
            skipped: true,
            report_id: result.report_id,
          })
        } else {
          await completeJob(job.id, {
            report_id: result.report_id,
            llm_used: result.llm_used,
            per_question_count: result.per_question_count,
            actions_count: result.actions_count,
            drafts_created: result.drafts_created,
            topics_weak: result.topics_weak,
            subjects_in_notebook: result.subjects_in_notebook,
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
