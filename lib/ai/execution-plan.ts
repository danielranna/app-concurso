import { supabaseServer } from "../supabase-server"
import type {
  DailyStudyBlock,
  DailyStudyPlan,
  PlanGenerationMeta,
  PlanGenerationStep,
  SubjectPickDiagnostic,
} from "../coach-types"
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
  advanceCycleDayIndex,
  getTodayCycleBlocks,
  getTodayCycleDay,
} from "../study-cycle-db"
import { buildDailyBlocksFromCycleBlocks } from "../cycle-block-executor"
import {
  buildRoundRobinQuestionSet,
  buildTopNQuestionSet,
  type QueueRow,
} from "./execution-questions"
import {
  buildQueueBySubject,
  ensureQueuesForExecutorSubjects,
  loadExecutorQueueForSubjects,
} from "./executor-queue"
import { resolvePrioritySource } from "../priority-source"
import {
  buildComprehensionSummaryBlocks,
  enqueueExecutorErrorDrafts,
  enqueueExecutorFlashcardDrafts,
  planRowToDailyStudyPlan,
} from "./execution-helpers"

export type GenerateDailyStudyPlanOptions = {
  pin?: boolean
  refreshQueue?: boolean
  subjectId?: string
  recentWrongTopics?: string[]
  onProgress?: (step: PlanGenerationStep) => void
}

function aggregatePickDiagnostics(
  rows: SubjectPickDiagnostic[]
): SubjectPickDiagnostic[] {
  const bySubject = new Map<string, SubjectPickDiagnostic>()
  for (const row of rows) {
    const prev = bySubject.get(row.subject_id)
    if (!prev) {
      bySubject.set(row.subject_id, { ...row })
      continue
    }
    bySubject.set(row.subject_id, {
      ...prev,
      picked: prev.picked + row.picked,
      requested: Math.max(prev.requested, row.requested),
      source:
        row.picked > 0 && row.source === "subject_fallback"
          ? "subject_fallback"
          : prev.picked > 0
            ? prev.source
            : row.source,
      skip_reason: row.picked > 0 ? undefined : prev.skip_reason ?? row.skip_reason,
      topics_tried: [...(prev.topics_tried ?? []), ...(row.topics_tried ?? [])],
    })
  }
  return [...bySubject.values()]
}

export async function generateDailyStudyPlan(
  userId: string,
  force = false,
  options?: GenerateDailyStudyPlanOptions
): Promise<DailyStudyPlan & { user_pinned?: boolean; completed_block_keys?: string[] }> {
  const generationSteps: PlanGenerationStep[] = []
  const emit = (step: PlanGenerationStep) => {
    generationSteps.push(step)
    options?.onProgress?.(step)
  }

  emit({ phase: "loading_context", message: "Carregando preferências e fila…" })

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
  const useCycle =
    execPrefs.cycle_enabled && mode === "pre_edital"

  let cycleContext: Awaited<ReturnType<typeof getTodayCycleDay>> = null
  let cycleBlockCtx: Awaited<ReturnType<typeof getTodayCycleBlocks>> = null
  if (useCycle) {
    cycleBlockCtx = await getTodayCycleBlocks(userId)
    cycleContext = cycleBlockCtx
  }

  let questionsBudget = limits.questions
  let flashBudget = limits.flashcards
  let summariesBudget = limits.summaries

  if (cycleContext?.day) {
    const todayWd = new Date(ctx.today + "T12:00:00").getDay()
    const wdLimit = cycleContext.cycle.weekday_limits.find(
      (w) => w.weekday === todayWd
    )
    if (wdLimit?.daily_limits) {
      const cycleQ = Number(wdLimit.daily_limits.questions)
      const cycleF = Number(wdLimit.daily_limits.flashcards)
      const cycleS = Number(wdLimit.daily_limits.summaries)
      if (Number.isFinite(cycleQ) && cycleQ > 0) {
        questionsBudget = Math.min(limits.questions, cycleQ)
      }
      if (Number.isFinite(cycleF) && cycleF > 0) {
        flashBudget = Math.min(limits.flashcards, cycleF)
      }
      if (Number.isFinite(cycleS) && cycleS > 0) {
        summariesBudget = Math.min(limits.summaries, cycleS)
      }
    }
  }

  const blocks: DailyStudyBlock[] = []

  const prioritySource = resolvePrioritySource(mode)
  const pool = await resolveExecutorSubjectPool(userId, ctx.queue as QueueRow[])
  const { subjectNames, orderedForCycle: poolOrdered } = pool

  // Pré-edital: executor usa todas as matérias elegíveis (fila cérebro), não só o dia do ciclo
  const orderedForExecutor =
    mode === "pre_edital"
      ? poolOrdered
      : cycleContext?.day?.subject_ids?.length
        ? cycleContext.day.subject_ids.filter((id) => pool.allowlist.includes(id)).length
          ? cycleContext.day.subject_ids.filter((id) => pool.allowlist.includes(id))
          : poolOrdered
        : poolOrdered

  let queue = await loadExecutorQueueForSubjects(
    userId,
    orderedForExecutor,
    prioritySource
  )
  let queueBySubject = buildQueueBySubject(queue)

  const ensured = await ensureQueuesForExecutorSubjects(
    userId,
    orderedForExecutor,
    prioritySource,
    queueBySubject,
    { onProgress: emit, subjectNames }
  )
  queue = ensured.queue
  queueBySubject = ensured.queueBySubject

  const subjectLabels = orderedForExecutor
    .map((id) => subjectNames.get(id))
    .filter(Boolean) as string[]

  emit({
    phase: "subjects_selected",
    message: `Matérias selecionadas: ${subjectLabels.join(", ") || "nenhuma"}`,
    detail: {
      subject_ids: orderedForExecutor,
      subject_names: subjectLabels,
    },
  })

  emit({
    phase: "queue_loaded",
    message: `Limite do dia: ${questionsBudget} questão(ões) · Fila ${mode === "pre_edital" ? "cérebro" : "cruzada"}: ${queue.length} tópico(s)`,
    detail: {
      queue_size: queue.length,
      study_mode: mode,
      questions_budget: questionsBudget,
    },
  })

  const manualCycleBlocks = cycleBlockCtx?.blocks ?? []
  const useManualBlocks = useCycle && manualCycleBlocks.length > 0

  const rotate =
    execPrefs.rotate_subjects && mode !== "reta_final"

  const perRound = Math.max(
    1,
    Number(execPrefs.questions_per_subject_round ?? 5)
  )

  const questionResult = rotate
    ? await buildRoundRobinQuestionSet({
        userId,
        orderedSubjectIds: orderedForExecutor,
        queueBySubject,
        subjectNames,
        budget: questionsBudget,
        perSubjectRound: perRound,
        distributionMode: execPrefs.question_distribution_mode,
        onProgress: emit,
        prioritySource,
      })
    : await buildTopNQuestionSet({
        userId,
        queue: queue.filter((q) => pool.allowlist.includes(q.subject_id)),
        subjectNames,
        budget: questionsBudget,
        allowlist: orderedForExecutor.filter((id) => pool.allowlist.includes(id)),
        onProgress: emit,
        prioritySource,
      })

  const allQuestionIds = questionResult.questionIds.slice(0, questionsBudget)
  let combinedNotebookId: string | null = null

  const primarySubjectId =
    questionResult.rounds[0]?.subject_id ??
    orderedForExecutor[0] ??
    pool.allowlist[0] ??
    null

  const subjectsInNotebook = [
    ...new Set(questionResult.rounds.map((r) => r.subject_id)),
  ]

  if (allQuestionIds.length > 0 && primarySubjectId) {
    const notebookLabels = subjectsInNotebook
      .map((id) => subjectNames.get(id))
      .filter(Boolean)
      .slice(0, 5)

    combinedNotebookId = await createNotebookFromQuestionIds(
      userId,
      `Plano ${ctx.today}${notebookLabels.length ? ` — ${notebookLabels.join(", ")}` : ""}`.slice(
        0,
        120
      ),
      primarySubjectId,
      allQuestionIds,
      null,
      false
    )

    emit({
      phase: "notebook_created",
      message: `Caderno montado com ${allQuestionIds.length} questão(ões)`,
      detail: {
        notebook_id: combinedNotebookId,
        question_count: allQuestionIds.length,
      },
    })

    blocks.push({
      subject_id: primarySubjectId,
      subject_name: notebookLabels.join(" · ") || "Várias matérias",
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

  if (useManualBlocks && cycleContext) {
    const cycleBlocks = await buildDailyBlocksFromCycleBlocks(
      userId,
      manualCycleBlocks,
      subjectNames,
      { skipQuestionBlocks: true }
    )
    blocks.push(...cycleBlocks)
  }

  const cycleSubjects =
    subjectsInNotebook.length > 0 ? subjectsInNotebook : orderedForExecutor

  const summaryResult = await buildComprehensionSummaryBlocks({
    userId,
    subjectIds: cycleSubjects,
    queueBySubject,
    summariesBudget,
    subjectNames,
  })
  blocks.push(...summaryResult.blocks)
  const summaryDrafts = summaryResult.inboxDrafts

  const flashDrafts = await enqueueExecutorFlashcardDrafts({
    userId,
    subjectIds: cycleSubjects,
    queueBySubject,
    limit: flashBudget,
  })

  const errorDrafts = await enqueueExecutorErrorDrafts({
    userId,
    subjectIds: cycleSubjects,
    queueBySubject,
    limit: limits.error_reviews,
  })

  const totalInboxDrafts = flashDrafts + summaryDrafts + errorDrafts
  if (totalInboxDrafts > 0) {
    const parts: string[] = []
    if (flashDrafts > 0) parts.push("flashcards")
    if (errorDrafts > 0) parts.push("erros")
    if (summaryDrafts > 0) parts.push("resumos")
    blocks.push({
      subject_id:
        questionResult.rounds[0]?.subject_id ?? cycleSubjects[0] ?? "",
      subject_name: "Inbox",
      type: "inbox_pending",
      count: totalInboxDrafts,
      minutes: totalInboxDrafts * 2,
      label: `${totalInboxDrafts} rascunho(s) na Inbox (${parts.join(" e ")})`,
      params: {
        block_key: `inbox_pending:${ctx.today}`,
        href: "/coach/inbox",
        flashcard_drafts: flashDrafts,
        summary_drafts: summaryDrafts,
        error_drafts: errorDrafts,
      },
    })
  }

  const planSource: PlanGenerationMeta["source"] = useManualBlocks
    ? "cycle_manual"
    : useCycle && cycleContext
      ? "cycle"
      : useCycle
        ? "executor"
        : "consultancy"

  let rotation_note = ""
  if (useManualBlocks && cycleContext) {
    rotation_note = `Ciclo manual — dia ${cycleContext.cycle.current_day_index + 1}/${cycleContext.cycle.total_days}: ${manualCycleBlocks.length} bloco(s) auxiliares. Caderno único pela fila cérebro (pré-edital).`
  } else if (useCycle && cycleContext) {
    rotation_note = `Ciclo ativo — dia ${cycleContext.cycle.current_day_index + 1}/${cycleContext.cycle.total_days}: ${orderedForExecutor.map((id) => subjectNames.get(id)).filter(Boolean).join(", ")}. Fila: cérebro (pré-edital).`
  } else if (rotate) {
    rotation_note = `Rodízio: ${perRound} questões erradas por matéria. ${orderedForExecutor.length} matérias.`
  } else {
    rotation_note = `Top da fila ${mode === "pre_edital" ? "cérebro" : "cruzada"} até ${questionsBudget} questões.`
  }

  emit({ phase: "done", message: "Plano montado." })

  const generation_meta: PlanGenerationMeta = {
    question_mode: rotate ? "round_robin" : "top_queue",
    distribution_mode: execPrefs.question_distribution_mode,
    questions_per_round: perRound,
    subject_order: orderedForExecutor.map((id) => ({
      subject_id: id,
      name: subjectNames.get(id) ?? id,
    })),
    rounds: questionResult.rounds,
    total_questions: allQuestionIds.length,
    inbox_drafts: {
      flashcards: flashDrafts,
      summaries: summaryDrafts,
      errors: errorDrafts,
    },
    subject_pick_diagnostics: aggregatePickDiagnostics(
      questionResult.subject_pick_diagnostics
    ),
    generation_steps: generationSteps,
    source: planSource,
    cycle_day_index: cycleContext?.cycle.current_day_index,
    cycle_id: cycleContext?.cycle.id,
  }

  const plan: DailyStudyPlan = {
    date: ctx.today,
    mode,
    limits: {
      ...limits,
      questions: questionsBudget,
      flashcards: flashBudget,
      summaries: summariesBudget,
    },
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

  if (useCycle && cycleContext && !ctx.existing_plan) {
    await advanceCycleDayIndex(
      cycleContext.cycle.id,
      cycleContext.cycle.total_days
    )
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
