import { supabaseServer } from "../supabase-server"
import type { DailyStudyBlock, DailyStudyPlan } from "../coach-types"
import { buildExecutionContext } from "./context-builder"
import { pickQuestionIdsFromPerformance } from "../notebook-from-performance"
import { runExecutionNarrativeAgent } from "./agents/execution"

export async function generateDailyStudyPlan(
  userId: string,
  force = false
): Promise<DailyStudyPlan> {
  const ctx = await buildExecutionContext(userId)

  if (ctx.existing_plan && !force) {
    return {
      id: ctx.existing_plan.id,
      date: ctx.today,
      mode: ctx.existing_plan.mode as DailyStudyPlan["mode"],
      limits: ctx.existing_plan.limits as DailyStudyPlan["limits"],
      blocks: ctx.existing_plan.blocks as DailyStudyBlock[],
      rotation_note: ctx.existing_plan.rotation_note ?? undefined,
      narrative_summary: ctx.existing_plan.narrative_summary ?? undefined,
    }
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

  const subjectIds = ctx.subjects.map((s) => s.id)
  const rotate = ctx.prefs.rotate_subjects && mode !== "reta_final"
  const pool = rotate
    ? subjectIds.filter((id) => !ctx.yesterday_subject_ids.includes(id))
    : subjectIds
  const orderedSubjects =
    pool.length > 0 ? pool : subjectIds

  const queueBySubject = new Map<string, typeof ctx.queue>()
  for (const item of ctx.queue) {
    const sid = item.subject_id as string
    const list = queueBySubject.get(sid) ?? []
    list.push(item)
    queueBySubject.set(sid, list)
  }

  const maxSubjectsPerDay =
    mode === "reta_final" ? Math.min(3, orderedSubjects.length) : Math.min(5, orderedSubjects.length)

  const pickedSubjects = orderedSubjects.slice(0, maxSubjectsPerDay)

  for (const subjectId of pickedSubjects) {
    const sub = ctx.subjects.find((s) => s.id === subjectId)
    const topTopics = (queueBySubject.get(subjectId) ?? []).slice(0, 3)
    const topic = topTopics[0]?.topic_key as string | undefined

    if (questionsBudget > 0) {
      const count = Math.min(
        mode === "reta_final" ? 15 : 10,
        questionsBudget
      )
      const questionIds = await pickQuestionIdsFromPerformance(userId, {
        subject_id: subjectId,
        wrong_only: true,
        min_wrong_attempts: 1,
        tec_topics: topic ? [topic] : undefined,
        limit: count,
      })

      blocks.push({
        subject_id: subjectId,
        subject_name: sub?.name,
        type: "questions",
        count: questionIds.length || count,
        minutes: Math.min(45, count * 4),
        label: topic
          ? `${count} questões — ${topic}`
          : `${count} questões de reforço`,
        params: {
          question_ids: questionIds,
          tec_topics: topic ? [topic] : [],
          subject_id: subjectId,
          suggested_name: `Plano ${ctx.today} — ${sub?.name ?? "Matéria"}`,
        },
      })
      questionsBudget -= count
    }

    if (errorBudget > 0) {
      const errCount = Math.min(5, errorBudget)
      blocks.push({
        subject_id: subjectId,
        subject_name: sub?.name,
        type: "error_review",
        count: errCount,
        minutes: errCount * 3,
        label: `Revisar ${errCount} erros`,
        params: { subject_id: subjectId },
      })
      errorBudget -= errCount
    }
  }

  if (flashBudget > 0 && ctx.flashcards_due > 0) {
    const fc = Math.min(flashBudget, ctx.flashcards_due, 20)
    blocks.push({
      subject_id: pickedSubjects[0] ?? subjectIds[0] ?? "",
      type: "flashcards",
      count: fc,
      minutes: fc * 2,
      label: `${fc} flashcards vencidos`,
      params: {},
    })
  }

  const rotation_note = rotate
    ? `Rotação: ${pickedSubjects.length} matérias hoje (excluídas as de ontem).`
    : `Prioridade pela fila estratégica (${mode}).`

  const plan: DailyStudyPlan = {
    date: ctx.today,
    mode,
    limits,
    blocks,
    rotation_note,
  }

  plan.narrative_summary = await runExecutionNarrativeAgent({ userId, plan }).catch(
    () => ""
  )

  const { data: row, error } = await supabaseServer
    .from("daily_study_plans")
    .upsert(
      {
        user_id: userId,
        plan_date: ctx.today,
        mode: plan.mode,
        limits: plan.limits,
        blocks: plan.blocks,
        rotation_note: plan.rotation_note,
        narrative_summary: plan.narrative_summary,
      },
      { onConflict: "user_id,plan_date" }
    )
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  plan.id = row?.id

  for (const block of blocks) {
    if (block.type === "questions" && block.params.question_ids) {
      const ids = block.params.question_ids as string[]
      if (!ids.length) continue
      await supabaseServer.from("ai_action_drafts").insert({
        user_id: userId,
        subject_id: block.subject_id,
        type: "notebook_create",
        label: block.label,
        payload: {
          question_ids: ids,
          subject_id: block.subject_id,
          suggested_name: block.params.suggested_name,
          from_daily_plan: true,
        },
        source_agent: "execution",
        status: "pending",
      })
    }
  }

  return plan
}
