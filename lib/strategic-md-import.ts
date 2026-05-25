import { supabaseServer } from "./supabase-server"
import { COACH_DOCS_BUCKET } from "./coach-documents"
import type { ExamPlanStructured } from "./coach-types"
import type { IncidenceFlatRow, ParsedIncidenceWorkbook } from "./incidence-xlsx"
import { persistIncidenceRows } from "./incidence-rows-db"
import { mapStrategicMdToSubjects, mdNameForSlug } from "./strategic-md-map"
import { parseStrategicMd, validateStrategicMd } from "./strategic-md-parser"
import type { StrategicMdBundle } from "./strategic-md-types"
import type { SubjectRow } from "./incidence-subject-map"

export function bundleToIncidenceWorkbook(bundle: StrategicMdBundle): ParsedIncidenceWorkbook {
  const flat_rows: IncidenceFlatRow[] = []
  const blocks = bundle.edital_subjects.map((sub) => {
    const topics = bundle.topics_by_slug[sub.slug] ?? []
    const groups = topics.map((t, i) => ({
      code: String(i + 1).padStart(2, "0"),
      name: t.topic,
      quantity: t.quantity,
      percent: t.percent,
      is_subtopic: false,
      parent_code: null as string | null,
    }))
    for (const t of topics) {
      flat_rows.push({
        sheet_name: "MD",
        subject_label: sub.name,
        hierarchy_code: String(topics.indexOf(t) + 1).padStart(2, "0"),
        topic_name: t.topic,
        is_subtopic: false,
        parent_code: null,
        quantity: t.quantity,
        percent: t.percent,
      })
    }
    return {
      subject_label: sub.name,
      total_quantity: topics.reduce((s, t) => s + t.quantity, 0),
      groups,
    }
  })

  const topic_count = flat_rows.length
  return {
    blocks,
    flat_rows,
    sheet_names: ["MD"],
    stats: {
      subject_count: blocks.length,
      topic_count,
      subtopic_count: 0,
      ignored_count: bundle.parse_warnings.length,
      ignored_samples: bundle.parse_warnings.slice(0, 20),
      subjects: blocks.length,
      topics: topic_count,
      subtopics: 0,
      rows_imported: topic_count,
    },
  }
}

export function bundleToExamPriorities(bundle: StrategicMdBundle): ExamPlanStructured {
  const subject_priority_rank = bundle.subject_ranking.map((r) => ({
    subject_name: r.name,
    priority: r.ranking,
    why: r.justificativa ?? r.observacao ?? "",
    edital_weight: r.peso_relativo != null ? String(r.peso_relativo) : r.prova ?? "",
    incidence_summary: bundle.incidence_subjects
      .find((i) => i.slug === r.slug)
      ?.classificacao ?? "",
  }))

  const topic_matrix: ExamPlanStructured["topic_matrix"] = []
  for (const [slug, topics] of Object.entries(bundle.topics_by_slug)) {
    const subName = mdNameForSlug(bundle, slug)
    for (const t of topics.slice(0, 30)) {
      topic_matrix!.push({
        subject: subName,
        topic: t.topic,
        incidence_percent: t.percent,
        incidence_quantity: t.quantity,
        incidence_hint: `${t.quantity} questões históricas`,
      })
    }
  }

  const headline =
    bundle.metadata.concurso ??
    bundle.metadata.cargo ??
    "Análise estratégica importada"

  return {
    headline,
    subject_priority_rank,
    topic_matrix,
    risks_if_ignored: bundle.alerts.map((a) => `${a.alerta}: ${a.descricao}`),
  }
}

export function bundleToEditalStructure(bundle: StrategicMdBundle) {
  return {
    subjects: bundle.edital_subjects.map((s) => ({
      name: s.name,
      slug: s.slug,
      edital_weight: s.prova === "P2" ? "alta" : "media",
      itens: s.itens,
      topics: (bundle.topics_by_slug[s.slug] ?? []).slice(0, 20).map((t) => ({
        name: t.topic,
        weight_hint: `${t.percent}% histórico`,
      })),
    })),
  }
}

export async function importStrategicMd(params: {
  userId: string
  examTargetId: string
  markdown: string
  title: string
}) {
  const bundle = parseStrategicMd(params.markdown)
  const validationError = validateStrategicMd(bundle)
  if (validationError) throw new Error(validationError)

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", params.userId)

  const subjectMappings = mapStrategicMdToSubjects(
    bundle,
    (subjects ?? []) as SubjectRow[]
  )

  await supabaseServer
    .from("subject_documents")
    .delete()
    .eq("user_id", params.userId)
    .eq("exam_target_id", params.examTargetId)
    .in("doc_type", ["edital", "incidence", "strategic_md"])

  const incidenceWorkbook = bundleToIncidenceWorkbook(bundle)
  const priorities = bundleToExamPriorities(bundle)
  const structure = bundleToEditalStructure(bundle)

  const topicCount = incidenceWorkbook.flat_rows.length
  const parsed_tables = {
    format: "strategic_md",
    scope: "exam_strategic",
    full_text: params.markdown,
    bundle,
    subject_mappings: subjectMappings,
    manual_overrides: subjectMappings.manual_overrides,
    merge_warnings: subjectMappings.merge_warnings,
    parse_stats: {
      subjects: bundle.edital_subjects.length,
      topics: topicCount,
      subtopics: 0,
      rows_imported: topicCount,
      rows_inserted_db: 0,
      warnings: bundle.parse_warnings,
    },
  }

  const path = `${params.userId}/strategic_md/${Date.now()}.md`
  const buffer = Buffer.from(params.markdown, "utf-8")

  await supabaseServer.storage.from(COACH_DOCS_BUCKET).upload(path, buffer, {
    contentType: "text/markdown",
    upsert: false,
  })

  const { data: doc, error: docErr } = await supabaseServer
    .from("subject_documents")
    .insert({
      user_id: params.userId,
      exam_target_id: params.examTargetId,
      doc_type: "strategic_md",
      file_path: path,
      title: params.title,
      parsed_tables,
      status: "ready",
    })
    .select("*")
    .single()

  if (docErr) throw new Error(docErr.message)

  const persist = await persistIncidenceRows({
    userId: params.userId,
    examTargetId: params.examTargetId,
    documentId: doc.id,
    parsed: incidenceWorkbook,
  })

  if (persist.error) {
    throw new Error(`Análise salva, mas linhas não entraram no banco: ${persist.error}`)
  }

  const updated_stats = {
    ...parsed_tables.parse_stats,
    rows_inserted_db: persist.inserted,
  }
  await supabaseServer
    .from("subject_documents")
    .update({
      parsed_tables: { ...parsed_tables, parse_stats: updated_stats },
    })
    .eq("id", doc.id)

  await supabaseServer.from("exam_edital_analysis").upsert(
    {
      exam_target_id: params.examTargetId,
      user_id: params.userId,
      structure,
      priorities,
      enrichment: {},
      edital_full_text_length: params.markdown.length,
      model_used: "md_import",
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "exam_target_id" }
  )

  const meta = bundle.metadata
  const examPatch: Record<string, string> = {}
  if (meta.banca) examPatch.banca = meta.banca
  if (meta.cargo) examPatch.cargo = meta.cargo
  if (meta.concurso) examPatch.name = meta.concurso.split(" - ")[0]?.trim() || meta.concurso

  if (Object.keys(examPatch).length) {
    await supabaseServer
      .from("exam_targets")
      .update(examPatch)
      .eq("id", params.examTargetId)
      .eq("user_id", params.userId)
  }

  const { recomputeAllSubjectsQueue } = await import("./ai/strategic-queue")
  await recomputeAllSubjectsQueue(params.userId).catch(() => {})

  return {
    document: { ...doc, parsed_tables: { ...parsed_tables, parse_stats: updated_stats } },
    bundle,
    subject_mappings: subjectMappings,
    rows_inserted: persist.inserted,
    priorities,
  }
}

export async function getStrategicMdDocument(userId: string, examTargetId: string) {
  const { data } = await supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .eq("doc_type", "strategic_md")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

export async function setStrategicSlugOverride(params: {
  userId: string
  documentId: string
  slug: string
  subjectId: string | null
}) {
  const { data: doc, error } = await supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("id", params.documentId)
    .eq("user_id", params.userId)
    .eq("doc_type", "strategic_md")
    .single()

  if (error || !doc) throw new Error("Documento MD não encontrado")

  const pt = (doc.parsed_tables ?? {}) as {
    bundle?: StrategicMdBundle
    manual_overrides?: Record<string, string | null>
  }

  if (!pt.bundle) throw new Error("Bundle MD ausente no documento")

  const manual_overrides = {
    ...(pt.manual_overrides ?? {}),
    [params.slug]: params.subjectId,
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", params.userId)

  const subject_mappings = mapStrategicMdToSubjects(
    pt.bundle,
    (subjects ?? []) as SubjectRow[],
    manual_overrides
  )

  const { data: updated, error: upErr } = await supabaseServer
    .from("subject_documents")
    .update({
      parsed_tables: {
        ...pt,
        manual_overrides,
        subject_mappings,
        merge_warnings: subject_mappings.merge_warnings,
      },
    })
    .eq("id", params.documentId)
    .select("*")
    .single()

  if (upErr) throw new Error(upErr.message)
  return updated
}
