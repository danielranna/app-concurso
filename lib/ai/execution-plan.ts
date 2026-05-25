import { supabaseServer } from "../supabase-server"
import type { DailyStudyBlock, DailyStudyPlan } from "../coach-types"
import { buildExecutionContext } from "./context-builder"
import { pickQuestionIdsFromPerformance } from "../notebook-from-performance"
import { createNotebookFromQuestionIds } from "../notebook-from-performance"
import { runExecutionNarrativeAgent } from "./agents/execution"

export async function generateDailyStudyPlan(
  userId: string,
  force = false
): Promise<DailyStudyPlan> {
  const ctx = await buildExecutionContext(userId)

  if (ctx.existing_plan && !force) {
    const blocks = ctx.existing_plan.blocks as DailyStudyBlock[]
    return {
      id: ctx.existing_plan.id,
      date: ctx.today,
      mode: ctx.existing_plan.mode as DailyStudyPlan["mode"],
      limits: ctx.existing_plan.limits as DailyStudyPlan["limits"],
      blocks,
      rotation_note: ctx.existing_plan.rotation_note ?? undefined,
      narrative_summary: ctx.existing_plan.narrative_summary ?? undefined,
      combined_notebook_id:
        (ctx.existing_plan as { combined_notebook_id?: string })
          .combined_notebook_id ?? null,
      combined_question_count: blocks
        .filter((b) => b.type === "questions" && b.params?.is_combined)
        .reduce((s, b) => s + b.count, 0),
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
  const orderedSubjects = pool.length > 0 ? pool : subjectIds

  const queueBySubject = new Map<string, typeof ctx.queue>()
  for (const item of ctx.queue) {
    const sid = item.subject_id as string
    const list = queueBySubject.get(sid) ?? []
    list.push(item)
    queueBySubject.set(sid, list)
  }

  const maxSubjectsPerDay =
    mode === "reta_final"
      ? Math.min(3, orderedSubjects.length)
      : Math.min(5, orderedSubjects.length)

  const pickedSubjects = orderedSubjects.slice(0, maxSubjectsPerDay)

  const allQuestionIds: string[] = []
  const seenQ = new Set<string>()
  let primarySubjectId: string | null = null

  for (const subjectId of pickedSubjects) {
    if (questionsBudget <= 0) break
    const sub = ctx.subjects.find((s) => s.id === subjectId)
    const topTopics = (queueBySubject.get(subjectId) ?? []).slice(0, 3)
    const topic = topTopics[0]?.topic_key as string | undefined

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
      .map((id) => ctx.subjects.find((s) => s.id === id)?.name)
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

    blocks.push({
      subject_id: primarySubjectId,
      subject_name: subjectLabels.join(" · ") || "Várias matérias",
      type: "questions",
      count: allQuestionIds.length,
      minutes: Math.min(90, allQuestionIds.length * 4),
      label: `Caderno do dia (${allQuestionIds.length} questões)`,
      params: {
        question_ids: allQuestionIds,
        notebook_id: combinedNotebookId,
        is_combined: true,
        subject_ids: pickedSubjects,
      },
    })
  }

  for (const subjectId of pickedSubjects) {
    if (errorBudget <= 0) break
    const sub = ctx.subjects.find((s) => s.id === subjectId)
    const errCount = Math.min(5, errorBudget)
    blocks.push({
      subject_id: subjectId,
      subject_name: sub?.name,
      type: "error_review",
      count: errCount,
      minutes: errCount * 3,
      label: `Revisar erros — ${sub?.name ?? "matéria"}`,
      params: { subject_id: subjectId },
    })
    errorBudget -= errCount
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
    ? `Rotação: ${pickedSubjects.length} matérias. Questões em um único caderno.`
    : `Prioridade pela fila estratégica (${mode}). Questões em um único caderno.`

  const plan: DailyStudyPlan = {
    date: ctx.today,
    mode,
    limits,
    blocks,
    rotation_note,
    combined_notebook_id: combinedNotebookId,
    combined_question_count: allQuestionIds.length,
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
        limits: {
          ...plan.limits,
          combined_notebook_id: combinedNotebookId,
        },
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

  return plan
}
