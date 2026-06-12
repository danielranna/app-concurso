import { syncNotebookToContentIndex } from "./content-index-sync"
import {
  sanitizePostgresText,
  sanitizePostgresTextNullable,
} from "./sanitize-postgres-text"
import { supabaseServer } from "./supabase-server"
import { bulkLinkAssetToQuestions } from "./shared-assets-server"
import type {
  BankQuestionSnapshot,
  ImportQuestionInput,
  ParsedTecNotebook,
} from "./question-types"

function sanitizeImportQuestion(q: ImportQuestionInput): ImportQuestionInput {
  return {
    ...q,
    tec_url: sanitizePostgresText(q.tec_url),
    banca: sanitizePostgresTextNullable(q.banca),
    cargo: sanitizePostgresTextNullable(q.cargo),
    orgao: sanitizePostgresTextNullable(q.orgao),
    tec_subject: sanitizePostgresText(q.tec_subject),
    tec_topic: sanitizePostgresText(q.tec_topic),
    statement: sanitizePostgresText(q.statement),
    correct_answer: sanitizePostgresText(q.correct_answer),
    options: q.options.map((o) => ({
      label: sanitizePostgresText(o.label),
      text: sanitizePostgresText(o.text),
    })),
  }
}

export type ImportSharedLinkInput = {
  asset_id: string
  tec_ids: number[]
  overrides?: { tec_id: number; content_override: string }[]
}

export type ImportQuestionResult = {
  question_id: string
  tec_id: number
  created: boolean
  updated: boolean
}

/** Quando onlyLinked, importa só questões presentes em sharedLinks. */
export function filterQuestionsForImport(
  questions: ImportQuestionInput[],
  sharedLinks: ImportSharedLinkInput[] | undefined,
  onlyLinked: boolean
): ImportQuestionInput[] {
  if (!onlyLinked) return questions
  const linkedTecIds = new Set((sharedLinks ?? []).flatMap((l) => l.tec_ids))
  return questions.filter((q) => linkedTecIds.has(q.tec_id))
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
  q = sanitizeImportQuestion(q)

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
        type: q.type,
        tec_url: q.tec_url,
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
    only_linked_questions?: boolean
  }
): Promise<{
  notebook_id: string
  notebook_question_count: number
  created_questions: number
  reused_questions: number
  updated_questions: number
  skipped_in_notebook: number
  skipped_no_gabarito: number
  skipped_tec_ids: number[]
  linked_questions: number
  warnings: string[]
}> {
  const questionsToImport = filterQuestionsForImport(
    parsed.questions,
    opts.shared_links,
    opts.only_linked_questions === true
  )

  let created_questions = 0
  let reused_questions = 0
  let updated_questions = 0
  let skipped_in_notebook = 0
  let skipped_no_gabarito = 0
  const skipped_tec_ids: number[] = []
  const questionIds: { question_id: string; position: number }[] = []
  const tecToQuestionId = new Map<number, string>()
  const existingByTecId = await fetchBankQuestionsByTecIds(
    questionsToImport.map((q) => q.tec_id)
  )

  for (let i = 0; i < questionsToImport.length; i++) {
    const q = questionsToImport[i]
    const keepingBank = existingByTecId.has(q.tec_id) && !q.replace_in_bank
    if (!keepingBank && !q.correct_answer?.trim()) {
      skipped_no_gabarito++
      skipped_tec_ids.push(q.tec_id)
      continue
    }

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
      name: sanitizePostgresText(opts.name ?? parsed.name),
      share_url: sanitizePostgresTextNullable(parsed.share_url),
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

  if (opts.subject_id) {
    try {
      await syncNotebookToContentIndex(userId, notebook.id, opts.subject_id)
    } catch {
      /* índice opcional — não falha import */
    }
  }

  let linked_questions = 0
  for (const link of opts.shared_links ?? []) {
    const ids = link.tec_ids
      .map((tecId) => tecToQuestionId.get(tecId))
      .filter((id): id is string => Boolean(id))
    if (!ids.length) continue
    linked_questions += await bulkLinkAssetToQuestions(link.asset_id, userId, ids)

    for (const ov of link.overrides ?? []) {
      const questionId = tecToQuestionId.get(ov.tec_id)
      const override = sanitizePostgresText(ov.content_override ?? "").trim()
      if (!questionId || !override) continue
      const { error } = await supabaseServer
        .from("user_question_asset_links")
        .update({ content_override: override })
        .eq("user_id", userId)
        .eq("question_id", questionId)
        .eq("asset_id", link.asset_id)
      if (error) throw new Error(error.message)
    }
  }

  return {
    notebook_id: notebook.id,
    notebook_question_count: questionIds.length,
    created_questions,
    reused_questions,
    updated_questions,
    skipped_in_notebook,
    skipped_no_gabarito,
    skipped_tec_ids,
    linked_questions,
    warnings: parsed.warnings,
  }
}
