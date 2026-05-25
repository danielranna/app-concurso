import { supabaseServer } from "../supabase-server"
import type { DailyStudyBlock, DailyStudyPlan } from "../coach-types"
import { buildExecutionContext } from "./context-builder"
import { pickQuestionIdsFromPerformance } from "../notebook-from-performance"
import { createNotebookFromQuestionIds } from "../notebook-from-performance"
import { runExecutionNarrativeAgent } from "./agents/execution"
import {
  recomputeAllSubjectsQueue,
  recomputeStrategicQueue,
} from "./strategic-queue"
import {
  buildBlockKey,
  buildSummaryBlocks,
  pickClassifiedWrongAttempts,
  pickDueFlashcardStateIds,
  planRowToDailyStudyPlan,
  rankSubjectsByQueue,
  topQueueReasonForSubject,
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
    questions: Number(ctx.prefs.daily_limits.questions ?? 50),
    flashcards: Number(ctx.prefs.daily_limits.flashcards ?? 20),
    summaries: Number(ctx.prefs.daily_limits.summaries ?? 2),
    error_reviews: Number(ctx.prefs.daily_limits.error_reviews ?? 10),
  }

  const mode = ctx.prefs.study_mode
  const blocks: DailyStudyBlock[] = []
  let questionsBudget = limits.questions
  let flashBudget = limits.flashcards
  let errorBudget = limits.error_reviews ?? 10
  let summariesBudget = limits.summaries

  const subjectIds = ctx.subjects.map((s) => s.id)
  const subjectNames = new Map(ctx.subjects.map((s) => [s.id, s.name]))
  const rotate = ctx.prefs.rotate_subjects && mode !== "reta_final"
  const excludeRotation = rotate
    ? ctx.yesterday_subject_ids.filter((id): id is string => Boolean(id))
    : []
  const completedTopics = new Set(
    ctx.completed_block_keys
      .map((k) => {
        const parts = k.split(":")
        return parts.length >= 3 ? `${parts[1]}:${parts[2]}` : null
      })
      .filter(Boolean) as string[]
  )

  const queue = ctx.queue as {
    subject_id: string
    topic_key: string
    topic_label?: string
    priority_score: number
    edital_weight?: number
    subject_priority?: number
    reason?: string | null
  }[]

  const queueBySubject = new Map<string, typeof queue>()
  for (const item of queue) {
    const list = queueBySubject.get(item.subject_id) ?? []
    list.push(item)
    queueBySubject.set(item.subject_id, list)
  }
  for (const [, list] of queueBySubject) {
    list.sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
  }

  const rankedSubjects = rankSubjectsByQueue(subjectIds, queue, excludeRotation)

  const maxSubjectsPerDay =
    mode === "reta_final"
      ? Math.min(3, rankedSubjects.length)
      : Math.min(5, rankedSubjects.length)

  const pickedSubjects = rankedSubjects
    .filter((sid) => {
      const top = queueBySubject.get(sid)?.[0]
      if (!top) return true
      return !completedTopics.has(`${sid}:${top.topic_key}`)
    })
    .slice(0, maxSubjectsPerDay)

  const allQuestionIds: string[] = []
  const seenQ = new Set<string>()
  let primarySubjectId: string | null = null
  const questionTopicsUsed: string[] = []

  for (const subjectId of pickedSubjects) {
    if (questionsBudget <= 0) break
    const topTopics = (queueBySubject.get(subjectId) ?? []).slice(0, 3)
    const topic =
      (topTopics[0]?.topic_label as string | undefined) ??
      (topTopics[0]?.topic_key as string | undefined)
    if (topic) questionTopicsUsed.push(topic)

    const count = Math.min(
      mode === "reta_final" ? 15 : 12,
      Math.ceil(questionsBudget / Math.max(1, pickedSubjects.length))
    )

    const questionIds = await pickQuestionIdsFromPerformance(userId, {
      subject_id: subjectId,
      wrong_only: true,
      min_wrong_attempts: 1,
      tec_topics: topic ? [topic] : undefined,
      limit: count,
    })

    for (const qid of questionIds) {
      if (seenQ.has(qid)) continue
      seenQ.add(qid)
      allQuestionIds.push(qid)
      if (!primarySubjectId) primarySubjectId = subjectId
      questionsBudget--
      if (questionsBudget <= 0) break
    }
  }

  let combinedNotebookId: string | null = null

  if (allQuestionIds.length > 0 && primarySubjectId) {
    const subjectLabels = pickedSubjects
      .map((id) => subjectNames.get(id))
      .filter(Boolean)
      .slice(0, 3)

    combinedNotebookId = await createNotebookFromQuestionIds(
      userId,
      `Plano ${ctx.today}${subjectLabels.length ? ` — ${subjectLabels.join(", ")}` : ""}`.slice(
        0,
        120
      ),
      primarySubjectId,
      allQuestionIds
    )

    const topReason = pickedSubjects
      .map((id) => topQueueReasonForSubject(queue, id))
      .find(Boolean)

    blocks.push({
      subject_id: primarySubjectId,
      subject_name: subjectLabels.join(" · ") || "Várias matérias",
      type: "questions",
      count: allQuestionIds.length,
      minutes: Math.min(90, allQuestionIds.length * 4),
      label: `Caderno do dia (${allQuestionIds.length} questões)`,
      params: {
        block_key: `questions:${primarySubjectId}:combined`,
        question_ids: allQuestionIds,
        notebook_id: combinedNotebookId,
        is_combined: true,
        subject_ids: pickedSubjects,
        queue_reason: topReason,
        topic_keys: questionTopicsUsed.slice(0, 5),
      },
    })
  }

  const summaryBlocks = await buildSummaryBlocks(
    userId,
    pickedSubjects,
    queue,
    queueBySubject,
    summariesBudget,
    subjectNames
  )
  blocks.push(...summaryBlocks)
  summariesBudget -= summaryBlocks.length

  for (const subjectId of pickedSubjects) {
    if (errorBudget <= 0) break
    const subName = subjectNames.get(subjectId)
    const top = (queueBySubject.get(subjectId) ?? [])[0]
    const topicKey = top?.topic_key
    const topicLabel = top?.topic_label ?? topicKey

    const wrongRows = await pickClassifiedWrongAttempts(userId, subjectId, {
      topicKey,
      limit: Math.min(5, errorBudget),
    })

    const errCount = wrongRows.length > 0 ? wrongRows.length : Math.min(3, errorBudget)

    blocks.push({
      subject_id: subjectId,
      subject_name: subName,
      type: "error_review",
      count: errCount,
      minutes: errCount * 3,
      label:
        wrongRows.length > 0
          ? `Revisar ${errCount} erros classificados — ${subName ?? "matéria"}`
          : `Revisar erros — ${subName ?? "matéria"}`,
      params: {
        block_key: `error_review:${subjectId}:${topicKey ?? "all"}`,
        subject_id: subjectId,
        topic_key: topicKey,
        attempt_ids: wrongRows.map((r) => r.attempt_id),
        question_ids: wrongRows.map((r) => r.question_id),
        queue_reason: top?.reason ?? topQueueReasonForSubject(queue, subjectId),
      },
    })
    errorBudget -= errCount
  }

  if (flashBudget > 0 && ctx.flashcards_due > 0) {
    const { stateIds, bySubject } = await pickDueFlashcardStateIds(
      userId,
      pickedSubjects,
      Math.min(flashBudget, ctx.flashcards_due, 20)
    )
    if (stateIds.length > 0) {
      const primaryFcSubject = pickedSubjects.find((id) => (bySubject[id] ?? 0) > 0)
      blocks.push({
        subject_id: primaryFcSubject ?? pickedSubjects[0] ?? subjectIds[0] ?? "",
        subject_name: primaryFcSubject
          ? subjectNames.get(primaryFcSubject)
          : undefined,
        type: "flashcards",
        count: stateIds.length,
        minutes: stateIds.length * 2,
        label: `${stateIds.length} flashcards (fila estratégica)`,
        params: {
          block_key: `flashcards:${primaryFcSubject ?? "all"}:due`,
          state_ids: stateIds,
          by_subject: bySubject,
          queue_reason: primaryFcSubject
            ? topQueueReasonForSubject(queue, primaryFcSubject)
            : undefined,
        },
      })
    }
  }

  const rotation_note = rotate
    ? `Rotação: ${pickedSubjects.length} matérias por score da fila. Caderno único.`
    : `Prioridade pela fila estratégica (${mode}). Caderno único.`

  const plan: DailyStudyPlan = {
    date: ctx.today,
    mode,
    limits,
    blocks,
    rotation_note,
    combined_notebook_id: combinedNotebookId,
    combined_question_count: allQuestionIds.length,
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
    fallback.limits = {
      ...plan.limits,
      combined_notebook_id: combinedNotebookId,
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

export { buildBlockKey }
