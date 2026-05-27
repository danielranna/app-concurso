import { supabaseServer } from "../supabase-server"
import type { DailyStudyBlock, DailyStudyPlan, PlanGenerationMeta } from "../coach-types"
import { buildExecutionContext } from "./context-builder"
import { createNotebookFromQuestionIds } from "../notebook-from-performance"
import { runExecutionNarrativeAgent } from "./agents/execution"
import {
  recomputeAllSubjectsQueue,
  recomputeStrategicQueue,
} from "./strategic-queue"
import {
  getExecutorStudyPreferences,
  resolveExecutorSubjectPool,
} from "./execution-subjects"
import {
  buildRoundRobinQuestionSet,
  buildTopNQuestionSet,
  type QueueRow,
} from "./execution-questions"
import {
  buildComprehensionSummaryBlocks,
  enqueueExecutorFlashcardDrafts,
  planRowToDailyStudyPlan,
} from "./execution-helpers"

export type GenerateDailyStudyPlanOptions = {
  pin?: boolean
  refreshQueue?: boolean
  subjectId?: string
  recentWrongTopics?: string[]
}

export async function generateDailyStudyPlan(
  userId: string,
  force = false,
  options?: GenerateDailyStudyPlanOptions
): Promise<DailyStudyPlan & { user_pinned?: boolean; completed_block_keys?: string[] }> {
  let ctx = await buildExecutionContext(userId)
  const execPrefs = await getExecutorStudyPreferences(userId)

  const existingPinned = Boolean(
    (ctx.existing_plan as { user_pinned?: boolean })?.user_pinned
  )

  if (
    ctx.existing_plan &&
    !force &&
    options?.pin !== undefined &&
    ctx.existing_plan.id
  ) {
    const { data: updated, error: pinErr } = await supabaseServer
      .from("daily_study_plans")
      .update({ user_pinned: options.pin })
      .eq("id", ctx.existing_plan.id)
      .select("*")
      .single()

    if (!pinErr && updated) {
      const plan = planRowToDailyStudyPlan(
        updated as Parameters<typeof planRowToDailyStudyPlan>[0]
      )
      return { ...plan, completed_block_keys: ctx.completed_block_keys }
    }
  }

  if (ctx.existing_plan && !force) {
    const plan = planRowToDailyStudyPlan(
      ctx.existing_plan as Parameters<typeof planRowToDailyStudyPlan>[0]
    )
    return { ...plan, completed_block_keys: ctx.completed_block_keys }
  }

  if (ctx.existing_plan && existingPinned && force && options?.pin !== false) {
    const plan = planRowToDailyStudyPlan(
      ctx.existing_plan as Parameters<typeof planRowToDailyStudyPlan>[0]
    )
    return { ...plan, completed_block_keys: ctx.completed_block_keys }
  }

  if (options?.refreshQueue) {
    if (options.subjectId) {
      await recomputeStrategicQueue(userId, options.subjectId, {
        withLlmNarrative: false,
        autoLlm: false,
        recentWrongTopics: options.recentWrongTopics,
      })
    } else {
      await recomputeAllSubjectsQueue(userId)
    }
    ctx = await buildExecutionContext(userId)
  }

  const limits = {
    questions: Number(execPrefs.daily_limits.questions ?? 50),
    flashcards: Number(execPrefs.daily_limits.flashcards ?? 20),
    summaries: Number(execPrefs.daily_limits.summaries ?? 2),
    error_reviews: Number(execPrefs.daily_limits.error_reviews ?? 10),
  }

  const mode = execPrefs.study_mode
  const blocks: DailyStudyBlock[] = []
  const questionsBudget = limits.questions
  const flashBudget = limits.flashcards
  const summariesBudget = limits.summaries

  const rotate =
    execPrefs.rotate_subjects && mode !== "reta_final"

  const queue = ctx.queue as QueueRow[]

  const queueBySubject = new Map<string, QueueRow[]>()
  for (const item of queue) {
    const list = queueBySubject.get(item.subject_id) ?? []
    list.push(item)
    queueBySubject.set(item.subject_id, list)
  }
  for (const [, list] of queueBySubject) {
    list.sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
  }

  const pool = await resolveExecutorSubjectPool(userId, queue)
  const { subjectNames, orderedForCycle } = pool

  const perRound = Math.max(
    1,
    Number(execPrefs.questions_per_subject_round ?? 5)
  )

  const questionResult = rotate
    ? await buildRoundRobinQuestionSet({
        userId,
        orderedSubjectIds: orderedForCycle,
        queueBySubject,
        subjectNames,
        budget: questionsBudget,
        perSubjectRound: perRound,
        distributionMode: execPrefs.question_distribution_mode,
      })
    : await buildTopNQuestionSet({
        userId,
        queue: queue.filter((q) =>
          pool.allowlist.includes(q.subject_id)
        ),
        subjectNames,
        budget: questionsBudget,
      })

  const allQuestionIds = questionResult.questionIds
  let combinedNotebookId: string | null = null
  const primarySubjectId =
    questionResult.rounds[0]?.subject_id ??
    orderedForCycle[0] ??
    pool.allowlist[0] ??
    null

  const subjectsInNotebook = [
    ...new Set(questionResult.rounds.map((r) => r.subject_id)),
  ]

  if (allQuestionIds.length > 0 && primarySubjectId) {
    const subjectLabels = subjectsInNotebook
      .map((id) => subjectNames.get(id))
      .filter(Boolean)
      .slice(0, 5)

    combinedNotebookId = await createNotebookFromQuestionIds(
      userId,
      `Plano ${ctx.today}${subjectLabels.length ? ` — ${subjectLabels.join(", ")}` : ""}`.slice(
        0,
        120
      ),
      primarySubjectId,
      allQuestionIds,
      null,
      false
    )

    blocks.push({
      subject_id: primarySubjectId,
      subject_name: subjectLabels.join(" · ") || "Várias matérias",
      type: "questions",
      count: allQuestionIds.length,
      minutes: Math.min(90, allQuestionIds.length * 4),
      label: `Caderno do dia (${allQuestionIds.length} questões erradas)`,
      params: {
        block_key: `questions:${primarySubjectId}:combined`,
        question_ids: allQuestionIds,
        notebook_id: combinedNotebookId,
        is_combined: true,
        subject_ids: subjectsInNotebook,
        topic_keys: questionResult.topicsUsed.slice(0, 8),
      },
    })
  }

  const cycleSubjects =
    subjectsInNotebook.length > 0 ? subjectsInNotebook : orderedForCycle

  const { blocks: summaryBlocks, inboxDrafts: summaryDrafts } =
    await buildComprehensionSummaryBlocks({
      userId,
      subjectIds: cycleSubjects,
      queueBySubject,
      summariesBudget,
      subjectNames,
    })
  blocks.push(...summaryBlocks)

  const flashDrafts = await enqueueExecutorFlashcardDrafts({
    userId,
    subjectIds: cycleSubjects,
    queueBySubject,
    limit: flashBudget,
  })

  const totalInboxDrafts = flashDrafts + summaryDrafts
  if (totalInboxDrafts > 0) {
    blocks.push({
      subject_id: primarySubjectId ?? cycleSubjects[0] ?? "",
      subject_name: "Inbox",
      type: "inbox_pending",
      count: totalInboxDrafts,
      minutes: totalInboxDrafts * 2,
      label: `${totalInboxDrafts} rascunho(s) na Inbox (flashcards e resumos)`,
      params: {
        block_key: `inbox_pending:${ctx.today}`,
        href: "/coach/inbox",
        flashcard_drafts: flashDrafts,
        summary_drafts: summaryDrafts,
      },
    })
  }

  const generation_meta: PlanGenerationMeta = {
    question_mode: rotate ? "round_robin" : "top_queue",
    distribution_mode: execPrefs.question_distribution_mode,
    questions_per_round: perRound,
    subject_order: orderedForCycle.map((id) => ({
      subject_id: id,
      name: subjectNames.get(id) ?? id,
    })),
    rounds: questionResult.rounds,
    total_questions: allQuestionIds.length,
    inbox_drafts: {
      flashcards: flashDrafts,
      summaries: summaryDrafts,
    },
  }

  const rotation_note = rotate
    ? `Rodízio: ${perRound} questões erradas por matéria (${execPrefs.question_distribution_mode === "equal_split" ? "quota igual no ciclo" : "fixo"}). ${orderedForCycle.length} matérias no ciclo.`
    : `Top da fila cruzada até ${questionsBudget} questões erradas (sem consolidar).`

  const plan: DailyStudyPlan = {
    date: ctx.today,
    mode,
    limits,
    blocks,
    rotation_note,
    combined_notebook_id: combinedNotebookId,
    combined_question_count: allQuestionIds.length,
    generation_meta,
  }

  plan.narrative_summary = await runExecutionNarrativeAgent({
    userId,
    plan,
    queueTop: queue.slice(0, 10),
  }).catch(() => "")

  const userPinned =
    options?.pin === true
      ? true
      : options?.pin === false
        ? false
        : existingPinned && !force

  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    plan_date: ctx.today,
    mode: plan.mode,
    limits: plan.limits,
    blocks: plan.blocks,
    rotation_note: plan.rotation_note,
    narrative_summary: plan.narrative_summary,
    user_pinned: userPinned,
    combined_notebook_id: combinedNotebookId,
    generation_meta,
  }

  const { data: row, error } = await supabaseServer
    .from("daily_study_plans")
    .upsert(upsertPayload, { onConflict: "user_id,plan_date" })
    .select("id, user_pinned")
    .single()

  if (error) {
    const fallback = { ...upsertPayload }
    delete fallback.user_pinned
    delete fallback.combined_notebook_id
    delete fallback.generation_meta
    fallback.limits = {
      ...plan.limits,
      combined_notebook_id: combinedNotebookId,
      generation_meta,
    }
    const { data: row2, error: err2 } = await supabaseServer
      .from("daily_study_plans")
      .upsert(fallback, { onConflict: "user_id,plan_date" })
      .select("id")
      .single()
    if (err2) throw new Error(err2.message)
    plan.id = row2?.id
  } else {
    plan.id = row?.id
  }

  return {
    ...plan,
    user_pinned: Boolean(row?.user_pinned ?? upsertPayload.user_pinned),
    completed_block_keys: ctx.completed_block_keys,
  }
}

export async function markPlanBlockComplete(
  userId: string,
  planId: string,
  blockKey: string
): Promise<{ ok: boolean }> {
  const { data: plan } = await supabaseServer
    .from("daily_study_plans")
    .select("id, user_id")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!plan) throw new Error("Plano não encontrado")

  const { error } = await supabaseServer.from("plan_block_completions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      block_key: blockKey,
    },
    { onConflict: "plan_id,block_key" }
  )

  if (error) throw new Error(error.message)
  return { ok: true }
}

export { buildBlockKey } from "./execution-helpers"
