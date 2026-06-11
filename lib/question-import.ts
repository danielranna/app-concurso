import { supabaseServer } from "./supabase-server"
import { bulkLinkAssetToQuestions } from "./shared-assets"
import type {
  BankQuestionSnapshot,
  ImportQuestionInput,
  ParsedTecNotebook,
} from "./question-types"

export type ImportSharedLinkInput = {
  asset_id: string
  tec_ids: number[]
}

export type ImportQuestionResult = {
  question_id: string
  tec_id: number
  created: boolean
  updated: boolean
}

export async function fetchBankQuestionsByTecIds(
  tecIds: number[]
): Promise<Map<number, BankQuestionSnapshot>> {
  const unique = [...new Set(tecIds)]
  if (unique.length === 0) return new Map()

  const { data: rows, error } = await supabaseServer
    .from("questions")
    .select(
      "id, tec_id, type, tec_subject, tec_topic, statement, correct_answer, banca, cargo, orgao, ano, imported_at"
    )
    .in("tec_id", unique)

  if (error) throw new Error(error.message)
  if (!rows?.length) return new Map()

  const questionIds = rows.map((r) => r.id as string)
  const { data: optionRows, error: optErr } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", questionIds)
    .order("sort_order")

  if (optErr) throw new Error(optErr.message)

  const optionsByQuestion = new Map<string, { label: string; text: string }[]>()
  for (const opt of optionRows ?? []) {
    const list = optionsByQuestion.get(opt.question_id as string) ?? []
    list.push({ label: opt.label as string, text: opt.text as string })
    optionsByQuestion.set(opt.question_id as string, list)
  }

  const map = new Map<number, BankQuestionSnapshot>()
  for (const row of rows) {
    map.set(row.tec_id as number, {
      id: row.id as string,
      tec_id: row.tec_id as number,
      type: row.type as BankQuestionSnapshot["type"],
      tec_subject: (row.tec_subject as string | null) ?? null,
      tec_topic: (row.tec_topic as string | null) ?? null,
      statement: row.statement as string,
      correct_answer: row.correct_answer as string,
      banca: (row.banca as string | null) ?? null,
      cargo: (row.cargo as string | null) ?? null,
      orgao: (row.orgao as string | null) ?? null,
      ano: (row.ano as number | null) ?? null,
      options: optionsByQuestion.get(row.id as string) ?? [],
      imported_at: row.imported_at as string,
    })
  }

  return map
}

export async function upsertGlobalQuestion(
  q: ImportQuestionInput
): Promise<ImportQuestionResult> {
  const { data: existing } = await supabaseServer
    .from("questions")
    .select("id, tec_id")
    .eq("tec_id", q.tec_id)
    .maybeSingle()

  if (existing) {
    if (!q.replace_in_bank) {
      return {
        question_id: existing.id,
        tec_id: q.tec_id,
        created: false,
        updated: false,
      }
    }

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

    return {
      question_id: existing.id,
      tec_id: q.tec_id,
      created: false,
      updated: true,
    }
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

  return {
    question_id: inserted.id,
    tec_id: q.tec_id,
    created: true,
    updated: false,
  }
}

export async function importNotebookFromParsed(
  userId: string,
  parsed: Omit<ParsedTecNotebook, "questions"> & { questions: ImportQuestionInput[] },
  opts: {
    subject_id?: string | null
    folder_id?: string | null
    name?: string
    shared_links?: ImportSharedLinkInput[]
  }
): Promise<{
  notebook_id: string
  created_questions: number
  reused_questions: number
  updated_questions: number
  skipped_in_notebook: number
  linked_questions: number
  warnings: string[]
}> {
  let created_questions = 0
  let reused_questions = 0
  let updated_questions = 0
  let skipped_in_notebook = 0
  const questionIds: { question_id: string; position: number }[] = []
  const tecToQuestionId = new Map<number, string>()
  const existingByTecId = await fetchBankQuestionsByTecIds(
    parsed.questions.map((q) => q.tec_id)
  )

  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i]
    const keepingBank = existingByTecId.has(q.tec_id) && !q.replace_in_bank
    if (!keepingBank && !q.correct_answer?.trim()) continue

    const result = await upsertGlobalQuestion(q)
    if (result.created) created_questions++
    else if (result.updated) updated_questions++
    else reused_questions++
    tecToQuestionId.set(q.tec_id, result.question_id)
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

  let linked_questions = 0
  for (const link of opts.shared_links ?? []) {
    const ids = link.tec_ids
      .map((tecId) => tecToQuestionId.get(tecId))
      .filter((id): id is string => Boolean(id))
    if (!ids.length) continue
    linked_questions += await bulkLinkAssetToQuestions(link.asset_id, userId, ids)
  }

  return {
    notebook_id: notebook.id,
    created_questions,
    reused_questions,
    updated_questions,
    skipped_in_notebook,
    linked_questions,
    warnings: parsed.warnings,
  }
}
