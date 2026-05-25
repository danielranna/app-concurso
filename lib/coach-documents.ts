import { supabaseServer } from "./supabase-server"
import { extractPdfText } from "./pdf-extract"
import { buildTreesBySubject } from "./incidence-hierarchy"
import {
  buildSubjectPercentChecks,
  displayParseStats,
  incidenceSummaryForLlm,
  parseIncidenceXlsx,
  type IncidenceSubjectBlock,
} from "./incidence-xlsx"
import { persistIncidenceRows } from "./incidence-rows-db"
import {
  groupsForSubjectFromBlocks,
  mapIncidenceBlocksToSubjects,
  pickBlockForSubject,
  type ManualOverrides,
  type SubjectRow,
} from "./incidence-subject-map"

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[… texto truncado …]`
}

export const COACH_DOCS_BUCKET = "coach-documents"

export type CoachDocType = "edital" | "incidence" | "study_material" | "strategic_md"

export type IncidenceWorkbookDoc = {
  id: string
  title: string
  parsed_tables: {
    scope?: string
    blocks?: IncidenceSubjectBlock[]
    manual_overrides?: ManualOverrides
    subject_mappings?: ReturnType<typeof mapIncidenceBlocksToSubjects>
    block_count?: number
    sheet_names?: string[]
  }
}

export function getManualOverridesFromDoc(doc: {
  parsed_tables?: Record<string, unknown> | null
}): ManualOverrides {
  const pt = (doc.parsed_tables ?? {}) as { manual_overrides?: ManualOverrides }
  return pt.manual_overrides ?? {}
}

function recomputeSubjectMappings(
  blocks: IncidenceSubjectBlock[],
  subjects: SubjectRow[],
  manualOverrides: ManualOverrides
) {
  return mapIncidenceBlocksToSubjects(blocks, subjects, manualOverrides)
}

export async function getExamStrategicMd(
  userId: string,
  examTargetId: string
) {
  const docs = await listCoachDocuments(userId, {
    examTargetId,
    docType: "strategic_md",
  })
  return docs[0] ?? null
}

export async function getExamIncidenceHierarchy(
  userId: string,
  examTargetId: string
) {
  const wb = await getExamIncidenceWorkbook(userId, examTargetId)
  if (!wb) return null

  const pt = (wb.parsed_tables ?? {}) as {
    blocks?: IncidenceSubjectBlock[]
    trees_by_subject?: ReturnType<typeof buildTreesBySubject>
    parse_stats?: Record<string, unknown>
    subject_mappings?: ReturnType<typeof mapIncidenceBlocksToSubjects>
  }

  const blocks = pt.blocks ?? []
  const trees_by_subject =
    pt.trees_by_subject ??
    (blocks.length ? buildTreesBySubject(blocks) : {})

  const percent_checks = buildSubjectPercentChecks(blocks)

  const subjects = blocks.map((block) => {
    const check = percent_checks.find((c) => c.subject_label === block.subject_label)
    return {
      label: block.subject_label,
      total_quantity: block.total_quantity,
      topic_count: block.groups.length,
      tree: trees_by_subject[block.subject_label] ?? [],
      top_level_percent_sum: check?.top_level_sum ?? null,
      percent_sum_ok: check?.ok ?? null,
    }
  })

  return {
    exam_target_id: examTargetId,
    document_id: wb.id,
    subjects,
    trees_by_subject,
    parse_stats: pt.parse_stats ?? null,
    subject_mappings: pt.subject_mappings ?? null,
    subject_percent_checks: percent_checks,
  }
}

/** Único Excel de incidência da prova (todas as matérias no arquivo). */
export async function getExamIncidenceWorkbook(
  userId: string,
  examTargetId: string
): Promise<IncidenceWorkbookDoc | null> {
  const docs = await listCoachDocuments(userId, {
    examTargetId,
    docType: "incidence",
  })
  const wb = docs.find(
    (d) =>
      !d.subject_id &&
      (d.parsed_tables as { scope?: string } | null)?.scope === "exam_workbook"
  )
  if (!wb) return null
  return wb as IncidenceWorkbookDoc
}

export async function buildIncidencePayloadForExam(
  userId: string,
  examTargetId: string
) {
  const wb = await getExamIncidenceWorkbook(userId, examTargetId)
  const wbBlocks =
    (wb?.parsed_tables as { blocks?: IncidenceSubjectBlock[] } | null)?.blocks ??
    []

  if (wbBlocks.length) {
    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", userId)

    const manualOverrides = wb ? getManualOverridesFromDoc(wb) : {}
    const mapping = mapIncidenceBlocksToSubjects(
      wbBlocks,
      (subjects ?? []) as SubjectRow[],
      manualOverrides
    )

    return {
      workbook: wb,
      blocks: wbBlocks,
      mapping,
      for_llm: mapping.by_subject.map((row) => ({
        subject_id: row.subject_id,
        subject_name: row.subject_name,
        excel_label: row.excel_label,
        excel_labels: row.excel_labels,
        top_topics: [...row.groups]
          .sort((a, b) => b.percent - a.percent)
          .slice(0, 50)
          .map((g) => ({
            name: g.name,
            percent: g.percent,
            qty: g.quantity,
            code: g.code,
            is_subtopic: g.is_subtopic,
          })),
      })),
      merge_warnings: mapping.merge_warnings,
    }
  }

  const md = await getExamStrategicMd(userId, examTargetId)
  if (md) {
    const pt = (md.parsed_tables ?? {}) as {
      bundle?: { edital_subjects: { name: string }[]; topics_by_slug: Record<string, { topic: string; quantity: number; percent: number }[]> }
      subject_mappings?: ReturnType<typeof import("./strategic-md-map").mapStrategicMdToSubjects>
      merge_warnings?: { subject_id: string; subject_name: string; slugs: string[] }[]
    }
    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", userId)
    const mappings = pt.subject_mappings
    const by_subject = (subjects ?? []).map((sub) => {
      const slugRows =
        mappings?.by_slug.filter((r) =>
          (r.subject_ids ?? (r.subject_id ? [r.subject_id] : [])).includes(sub.id)
        ) ?? []
      const topics: { name: string; percent: number; qty: number; code: string }[] = []
      for (const row of slugRows) {
        const list = pt.bundle?.topics_by_slug[row.slug] ?? []
        for (const t of list) {
          topics.push({
            name: t.topic,
            percent: t.percent,
            qty: t.quantity,
            code: "",
          })
        }
      }
      topics.sort((a, b) => b.percent - a.percent)
      return {
        subject_id: sub.id,
        subject_name: sub.name,
        excel_label: slugRows.map((r) => r.md_name).join(" + ") || null,
        excel_labels: slugRows.map((r) => r.md_name),
        top_topics: topics.slice(0, 50),
      }
    })
    const emptyMapping = {
      by_subject: [] as ReturnType<typeof mapIncidenceBlocksToSubjects>["by_subject"],
      by_block: [] as ReturnType<typeof mapIncidenceBlocksToSubjects>["by_block"],
      unmapped_subjects: (subjects ?? []).filter(
        (sub) =>
          !mappings?.by_slug.some((r) =>
            (r.subject_ids ?? (r.subject_id ? [r.subject_id] : [])).includes(sub.id)
          )
      ),
      unmapped_blocks: [] as ReturnType<typeof mapIncidenceBlocksToSubjects>["unmapped_blocks"],
      merge_warnings: [] as ReturnType<typeof mapIncidenceBlocksToSubjects>["merge_warnings"],
    }
    for (const sub of subjects ?? []) {
      const slugRows =
        mappings?.by_slug.filter((r) =>
          (r.subject_ids ?? (r.subject_id ? [r.subject_id] : [])).includes(sub.id)
        ) ?? []
      if (!slugRows.length) continue
      const groups = slugRows.flatMap((row) => {
        const list = pt.bundle?.topics_by_slug[row.slug] ?? []
        return list.map((t, i) => ({
          code: String(i + 1).padStart(2, "0"),
          name: t.topic,
          quantity: t.quantity,
          percent: t.percent,
        }))
      })
      emptyMapping.by_subject.push({
        subject_id: sub.id,
        subject_name: sub.name,
        excel_label: slugRows.map((r) => r.md_name).join(" + "),
        excel_labels: slugRows.map((r) => r.md_name),
        match_score: Math.max(...slugRows.map((r) => r.match_score)),
        groups,
      })
    }

    return {
      workbook: md,
      blocks: [],
      mapping: emptyMapping,
      for_llm: by_subject.filter((r) => r.top_topics.length > 0),
      merge_warnings: (pt.merge_warnings ?? []).map((w) => ({
        subject_id: w.subject_id,
        subject_name: w.subject_name,
        excel_labels: w.slugs,
      })),
    }
  }

  return {
    workbook: null,
    blocks: [],
    mapping: {
      by_subject: [],
      by_block: [],
      unmapped_subjects: [],
      unmapped_blocks: [],
      merge_warnings: [],
    },
    for_llm: [],
    merge_warnings: [],
  }
}

export async function uploadCoachDocument(params: {
  userId: string
  file: File
  docType: CoachDocType
  title: string
  subjectId?: string | null
  subjectName?: string | null
  examTargetId?: string | null
}) {
  if (params.file.size > 20 * 1024 * 1024) {
    throw new Error("Arquivo maior que 20 MB")
  }

  const buffer = Buffer.from(await params.file.arrayBuffer())
  const ext = (params.file.name.split(".").pop() || "").toLowerCase()

  let parsed_tables: Record<string, unknown> = {}
  let contentType = params.file.type
  let incidenceParsed: ReturnType<typeof parseIncidenceXlsx> | null = null

  if (params.docType === "incidence") {
    if (!["xlsx", "xls"].includes(ext)) {
      throw new Error("Incidência deve ser arquivo Excel (.xlsx ou .xls)")
    }
    if (!params.examTargetId) {
      throw new Error("exam_target_id obrigatório para incidência")
    }

    try {
      incidenceParsed = parseIncidenceXlsx(buffer)
    } catch (parseErr) {
      const hint =
        parseErr instanceof Error ? parseErr.message : "formato inválido"
      throw new Error(`Não foi possível ler o Excel: ${hint}`)
    }
    const parsed = incidenceParsed

    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", params.userId)

    const isWorkbook = !params.subjectId
    const manualOverrides: ManualOverrides = isWorkbook ? {} : {}

    const subjectMappings = mapIncidenceBlocksToSubjects(
      parsed.blocks,
      (subjects ?? []) as SubjectRow[],
      manualOverrides
    )

    if (isWorkbook) {
      await supabaseServer
        .from("subject_documents")
        .delete()
        .eq("user_id", params.userId)
        .eq("exam_target_id", params.examTargetId)
        .eq("doc_type", "incidence")
        .is("subject_id", null)
    }

    const block =
      params.subjectName != null
        ? pickBlockForSubject(parsed.blocks, params.subjectName)
        : null

    parsed_tables = {
      format: "xlsx_incidence",
      scope: isWorkbook ? "exam_workbook" : "single_subject",
      sheet_names: parsed.sheet_names,
      blocks: parsed.blocks,
      flat_row_count: parsed.flat_rows.length,
      parse_stats: displayParseStats(parsed.stats),
      block_count: parsed.blocks.length,
      manual_overrides: isWorkbook ? manualOverrides : undefined,
      subject_mappings: isWorkbook ? subjectMappings : undefined,
      merge_warnings: isWorkbook ? subjectMappings.merge_warnings : [],
      matched_subject_label: block?.subject_label ?? null,
      groups: block?.groups ?? [],
      group_count: block?.groups.length ?? 0,
      summary_for_llm: incidenceSummaryForLlm(parsed),
      text_excerpt: JSON.stringify(incidenceSummaryForLlm(parsed), null, 0).slice(
        0,
        50_000
      ),
    }
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } else {
    if (ext !== "pdf") {
      throw new Error("Este tipo de documento deve ser PDF")
    }
    const text = await extractPdfText(buffer)
    const excerpt = truncateText(text, 120_000)
    parsed_tables = {
      format: "pdf",
      text_excerpt: excerpt,
      full_text: text,
      char_count: text.length,
    }
    contentType = "application/pdf"
  }

  const path = `${params.userId}/${params.docType}/${Date.now()}.${ext}`

  const { error: upErr } = await supabaseServer.storage
    .from(COACH_DOCS_BUCKET)
    .upload(path, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    })

  if (upErr) {
    if (upErr.message.includes("Bucket not found")) {
      throw new Error(
        'Crie o bucket "coach-documents" no Supabase Storage (privado).'
      )
    }
    throw new Error(upErr.message)
  }

  const { data: doc, error: insErr } = await supabaseServer
    .from("subject_documents")
    .insert({
      user_id: params.userId,
      subject_id: params.subjectId ?? null,
      exam_target_id: params.examTargetId ?? null,
      doc_type: params.docType,
      file_path: path,
      title: params.title.trim() || params.file.name,
      parsed_tables,
      status: "ready",
    })
    .select("*")
    .single()

  if (insErr) throw new Error(insErr.message)

  if (
    params.docType === "incidence" &&
    params.examTargetId &&
    !params.subjectId &&
    incidenceParsed
  ) {
    const persist = await persistIncidenceRows({
      userId: params.userId,
      examTargetId: params.examTargetId,
      documentId: doc.id,
      parsed: incidenceParsed,
    })

    const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
    const parse_stats = displayParseStats(
      (pt.parse_stats ?? incidenceParsed.stats) as Parameters<typeof displayParseStats>[0],
      {
        rowsInsertedDb: persist.inserted,
        persistError: persist.error,
      }
    )
    const updated_tables = {
      ...pt,
      parse_stats,
      flat_row_count: incidenceParsed.flat_rows.length || persist.inserted,
    }

    const { data: updated, error: statsErr } = await supabaseServer
      .from("subject_documents")
      .update({ parsed_tables: updated_tables })
      .eq("id", doc.id)
      .select("*")
      .single()

    if (statsErr) throw new Error(statsErr.message)
    if (updated) {
      Object.assign(doc, updated)
    }

    if (persist.error) {
      const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
      doc.parsed_tables = {
        ...pt,
        parse_stats: {
          ...((pt.parse_stats as object) ?? {}),
          persist_error: persist.error,
        },
      }
    }
  }

  if (params.docType === "edital" && params.examTargetId) {
    await supabaseServer
      .from("exam_targets")
      .update({ edital_document_id: doc.id })
      .eq("id", params.examTargetId)
      .eq("user_id", params.userId)
  }

  return doc
}

export async function listCoachDocuments(
  userId: string,
  filters?: { examTargetId?: string; subjectId?: string; docType?: CoachDocType }
) {
  let q = supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (filters?.examTargetId) q = q.eq("exam_target_id", filters.examTargetId)
  if (filters?.subjectId) q = q.eq("subject_id", filters.subjectId)
  if (filters?.docType) q = q.eq("doc_type", filters.docType)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export function documentTextExcerpt(doc: {
  parsed_tables?: Record<string, unknown> | null
}) {
  const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
  if (pt.format === "xlsx_incidence") {
    return String(pt.text_excerpt ?? JSON.stringify(pt.summary_for_llm ?? []))
  }
  if (pt.format === "pdf") {
    const full = String(pt.full_text ?? "")
    if (full.length > 0) return full
    return String(pt.text_excerpt ?? "")
  }
  return String(pt.text_excerpt ?? "")
}

export function documentIncidenceGroups(doc: {
  parsed_tables?: Record<string, unknown> | null
}) {
  const pt = (doc.parsed_tables ?? {}) as {
    groups?: { name: string; percent: number; quantity: number; code: string }[]
  }
  return pt.groups ?? []
}

/** Grupos de incidência para uma matéria (workbook único ou upload antigo por matéria). */
export async function incidenceGroupsForSubject(
  userId: string,
  examTargetId: string,
  subjectId: string,
  subjectName: string
) {
  const wb = await getExamIncidenceWorkbook(userId, examTargetId)
  if (wb?.parsed_tables?.blocks?.length) {
    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", userId)
    return groupsForSubjectFromBlocks(
      wb.parsed_tables.blocks,
      subjectName,
      subjectId,
      (subjects ?? []) as SubjectRow[],
      getManualOverridesFromDoc(wb)
    )
  }
  const docs = await listCoachDocuments(userId, {
    examTargetId,
    subjectId,
    docType: "incidence",
  })
  const legacy = docs[0]
  return legacy ? documentIncidenceGroups(legacy) : []
}

export async function setIncidenceBlockOverride(params: {
  userId: string
  documentId: string
  excelLabel: string
  subjectId: string | null
}) {
  const { data: doc, error } = await supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("id", params.documentId)
    .eq("user_id", params.userId)
    .eq("doc_type", "incidence")
    .single()

  if (error || !doc) throw new Error("Documento de incidência não encontrado")

  const pt = (doc.parsed_tables ?? {}) as {
    scope?: string
    blocks?: IncidenceSubjectBlock[]
    manual_overrides?: ManualOverrides
  }

  if (pt.scope !== "exam_workbook" || !pt.blocks?.length) {
    throw new Error("Edição de vínculo só vale para o Excel completo da prova")
  }

  const block = pt.blocks.find((b) => b.subject_label === params.excelLabel)
  if (!block) throw new Error("Bloco não encontrado no Excel importado")

  const manual_overrides: ManualOverrides = {
    ...(pt.manual_overrides ?? {}),
    [params.excelLabel]: params.subjectId,
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", params.userId)

  const subject_mappings = recomputeSubjectMappings(
    pt.blocks,
    (subjects ?? []) as SubjectRow[],
    manual_overrides
  )

  const parsed_tables = {
    ...pt,
    manual_overrides,
    subject_mappings,
  }

  const { data: updated, error: upErr } = await supabaseServer
    .from("subject_documents")
    .update({ parsed_tables })
    .eq("id", params.documentId)
    .eq("user_id", params.userId)
    .select("*")
    .single()

  if (upErr) throw new Error(upErr.message)
  return updated
}
