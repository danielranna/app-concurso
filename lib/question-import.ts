import { supabaseServer } from "./supabase-server"
import type { ParsedTecQuestion, ParsedTecNotebook } from "./question-types"

export type ImportQuestionResult = {
  question_id: string
  tec_id: number
  created: boolean
}

export async function upsertGlobalQuestion(
  q: ParsedTecQuestion
): Promise<ImportQuestionResult> {
  const { data: existing } = await supabaseServer
    .from("questions")
    .select("id, tec_id")
    .eq("tec_id", q.tec_id)
    .maybeSingle()

  if (existing) {
    await supabaseServer
      .from("questions")
      .update({
        statement: q.statement,
        correct_answer: q.correct_answer || undefined,
        banca: q.banca,
        cargo: q.cargo,
        orgao: q.orgao,
        ano: q.ano,
        tec_subject: q.tec_subject,
        tec_topic: q.tec_topic,
      })
      .eq("id", existing.id)

    if (q.type === "multiple_choice" && q.options.length > 0) {
      await supabaseServer.from("question_options").delete().eq("question_id", existing.id)
      await supabaseServer.from("question_options").insert(
        q.options.map((o, i) => ({
          question_id: existing.id,
          label: o.label,
          text: o.text,
          sort_order: i,
        }))
      )
    }

    return { question_id: existing.id, tec_id: q.tec_id, created: false }
  }

  const { data: inserted, error } = await supabaseServer
    .from("questions")
    .insert({
      tec_id: q.tec_id,
      tec_url: q.tec_url,
      type: q.type,
      banca: q.banca,
      cargo: q.cargo,
      orgao: q.orgao,
      ano: q.ano,
      tec_subject: q.tec_subject,
      tec_topic: q.tec_topic,
      statement: q.statement,
      correct_answer: q.correct_answer,
    })
    .select("id, tec_id")
    .single()

  if (error) throw new Error(error.message)

  if (q.type === "multiple_choice" && q.options.length > 0) {
    await supabaseServer.from("question_options").insert(
      q.options.map((o, i) => ({
        question_id: inserted.id,
        label: o.label,
        text: o.text,
        sort_order: i,
      }))
    )
  }

  return { question_id: inserted.id, tec_id: q.tec_id, created: true }
}

export async function importNotebookFromParsed(
  userId: string,
  parsed: ParsedTecNotebook,
  opts: {
    subject_id?: string | null
    folder_id?: string | null
    name?: string
  }
): Promise<{
  notebook_id: string
  created_questions: number
  reused_questions: number
  skipped_in_notebook: number
  warnings: string[]
}> {
  let created_questions = 0
  let reused_questions = 0
  let skipped_in_notebook = 0
  const questionIds: { question_id: string; position: number }[] = []

  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i]
    if (!q.correct_answer) continue
    const result = await upsertGlobalQuestion(q)
    if (result.created) created_questions++
    else reused_questions++
    questionIds.push({ question_id: result.question_id, position: i })
  }

  const { data: notebook, error: nbErr } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id: userId,
      subject_id: opts.subject_id ?? null,
      folder_id: opts.folder_id ?? null,
      name: opts.name ?? parsed.name,
      share_url: parsed.share_url,
      question_count: questionIds.length,
    })
    .select("id")
    .single()

  if (nbErr) throw new Error(nbErr.message)

  for (const item of questionIds) {
    const { error } = await supabaseServer.from("notebook_questions").insert({
      notebook_id: notebook.id,
      question_id: item.question_id,
      position: item.position,
    })
    if (error) {
      if (error.code === "23505") skipped_in_notebook++
      else throw new Error(error.message)
    }
  }

  return {
    notebook_id: notebook.id,
    created_questions,
    reused_questions,
    skipped_in_notebook,
    warnings: parsed.warnings,
  }
}
