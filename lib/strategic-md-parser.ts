import type {
  StrategicAlert,
  StrategicEditalSubject,
  StrategicIncidenceSubject,
  StrategicMdBundle,
  StrategicMdMetadata,
  StrategicPriorityGroup,
  StrategicStudyStep,
  StrategicSubjectRanking,
  StrategicTopicRow,
} from "./strategic-md-types"

function parseTableRows(section: string): string[][] {
  const lines = section.split("\n")
  const rows: string[][] = []
  let headers: string[] = []

  for (const line of lines) {
    const t = line.trim()
    if (!t.startsWith("|") || t.includes("---")) continue
    const cells = t
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
    if (!headers.length) {
      headers = cells.map((c) => c.toLowerCase())
      continue
    }
    rows.push(cells)
  }
  return rows
}

function parseKeyValueTable(section: string): StrategicMdMetadata {
  const meta: StrategicMdMetadata = {}
  for (const row of parseTableRows(section)) {
    if (row.length >= 2) meta[row[0]!.toLowerCase()] = row[1]!
  }
  return meta
}

function parseNum(raw: string): number | undefined {
  const s = raw.replace(",", ".").replace(/[^\d.-]/g, "")
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

function extractSection(md: string, title: string): string {
  const re = new RegExp(
    `## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n## |$)`,
    "i"
  )
  const m = md.match(re)
  return m ? m[0] : ""
}

function parseEditalSubjects(md: string): StrategicEditalSubject[] {
  const out: StrategicEditalSubject[] = []
  const p1 = extractSection(md, "RESUMO DO EDITAL")
  const p1Block = p1.match(
    /#### Prova P1[\s\S]*?(?=#### Prova P2|### |$)/i
  )?.[0]
  const p2Block = p1.match(/#### Prova P2[\s\S]*?(?=### |$)/i)?.[0]

  for (const [prova, block] of [
    ["P1", p1Block],
    ["P2", p2Block],
  ] as const) {
    if (!block) continue
    for (const row of parseTableRows(block)) {
      if (row.length < 3) continue
      const slug = row[0]!
      if (!slug || slug === "slug" || slug.includes("---")) continue
      const itens = parseNum(row[2] ?? "")
      if (itens == null) continue
      out.push({
        slug,
        name: row[1]!,
        prova: prova as "P1" | "P2",
        itens,
      })
    }
  }
  return out
}

function parseSubjectRanking(md: string): StrategicSubjectRanking[] {
  const section = extractSection(md, "RANKING DE RELEVANCIA DAS MATERIAS")
  const rankingBlock = section.match(
    /### Ranking Geral de Relevancia[\s\S]*?(?=### Explicacao|## |$)/i
  )?.[0]
  if (!rankingBlock) return []

  const out: StrategicSubjectRanking[] = []
  for (const row of parseTableRows(rankingBlock)) {
    if (row.length < 6) continue
    const ranking = parseNum(row[0] ?? "")
    const slug = row[1]!
    if (!slug || slug === "slug") continue
    out.push({
      ranking: ranking ?? out.length + 1,
      slug,
      name: row[2]!,
      prova: row[3],
      itens: parseNum(row[4] ?? ""),
      peso_relativo: parseNum(row[5] ?? ""),
      observacao: row[6],
    })
  }

  const justBlock = section.match(/### Explicacao do Ranking[\s\S]*/i)?.[0]
  if (justBlock) {
    for (const row of parseTableRows(justBlock)) {
      if (row.length < 2) continue
      const slug = row[0]!
      const item = out.find((r) => r.slug === slug)
      if (item) item.justificativa = row[1]
    }
  }
  return out
}

function parseIncidenceSubjects(md: string): StrategicIncidenceSubject[] {
  const section = extractSection(md, "MAPA DE INCIDENCIA DA BANCA")
  const tableBlock = section.match(
    /### Incidencia por Materia do Edital[\s\S]*?(?=### Tópicos|### Topicos|## |$)/i
  )?.[0]
  if (!tableBlock) return []

  const out: StrategicIncidenceSubject[] = []
  for (const row of parseTableRows(tableBlock)) {
    if (row.length < 5) continue
    const slug = row[1] ?? row[0]
    if (!slug || slug === "slug" || slug.includes("ranking")) continue
    const pctRaw = row[5] ?? row[4]
    const pct = parseNum(String(pctRaw ?? "").replace("%", ""))
    out.push({
      ranking_incidencia: parseNum(row[0] ?? ""),
      slug: slug!,
      name: row[2] ?? row[1]!,
      categoria_excel: row[3],
      total_historico: parseNum(row[4] ?? row[3] ?? ""),
      incidencia_relativa_pct: pct,
      classificacao: row[6] ?? row[5],
    })
  }
  return out
}

function parseTopicsBySlug(md: string): Record<string, StrategicTopicRow[]> {
  const section = extractSection(md, "MAPA DE INCIDENCIA DA BANCA")
  const topicsSection =
    section.match(/### Tópicos Mais Incidentes[\s\S]*/i)?.[0] ??
    section.match(/### Topicos Mais Incidentes[\s\S]*/i)?.[0] ??
    ""

  const bySlug: Record<string, StrategicTopicRow[]> = {}
  const parts = topicsSection.split(/(?=#### )/g)

  for (const part of parts) {
    const header = part.match(/^####\s+([^\s-]+)\s*-\s*(.+)/m)
    if (!header) continue
    const slug = header[1]!.trim()
    const rows: StrategicTopicRow[] = []
    let qtyCol = 1
    let nameCol = 0

    for (const line of part.split("\n")) {
      if (!line.trim().startsWith("|") || line.includes("---")) continue
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
      if (cells[0]?.toLowerCase().includes("topico") || cells[0]?.toLowerCase().includes("subarea")) {
        const h0 = cells[0]!.toLowerCase()
        if (h0.includes("subarea")) {
          nameCol = 0
          qtyCol = 1
        }
        continue
      }
      if (cells.length < 2) continue
      const qty = parseNum(cells[qtyCol] ?? "") ?? 0
      const topic = cells[nameCol]!
      if (!topic || topic.toLowerCase() === "nota") continue
      rows.push({
        topic,
        quantity: qty,
        percent: 0,
        is_subarea: nameCol === 0 && cells[0]?.toLowerCase().includes("subarea") === false && part.includes("subarea"),
      })
    }

    if (rows.length) {
      const sum = rows.reduce((s, r) => s + r.quantity, 0)
      for (const r of rows) {
        r.percent = sum > 0 ? Math.round((r.quantity / sum) * 1000) / 10 : 0
      }
      bySlug[slug] = rows
    } else if (part.toLowerCase().includes("nota:")) {
      bySlug[slug] = []
    }
  }
  return bySlug
}

function parsePriorityTable(
  block: string,
  kind: "prioritarias" | "secundarias" | "armadilha"
): StrategicPriorityGroup[] {
  const out: StrategicPriorityGroup[] = []
  for (const row of parseTableRows(block)) {
    if (row.length < 3) continue
    const slug = row[1] ?? row[0]
    if (!slug || slug === "slug" || slug === "prioridade") continue
    const item: StrategicPriorityGroup = {
      prioridade: parseNum(row[0] ?? "") ?? out.length + 1,
      slug: slug!,
      name: row[2] ?? row[1]!,
    }
    if (kind === "armadilha") {
      item.motivo = row[3]
      item.recomendacao = row[4]
    } else {
      item.justificativa = row[3]
    }
    out.push(item)
  }
  return out
}

function parsePriorities(md: string) {
  const section = extractSection(md, "CONCLUSOES ESTRATEGICAS")
  const pri = section.match(
    /### Materias Prioritarias[\s\S]*?(?=### Materias Secundarias|## |$)/i
  )?.[0]
  const sec = section.match(
    /### Materias Secundarias[\s\S]*?(?=### Materias Armadilha|## |$)/i
  )?.[0]
  const arm = section.match(/### Materias Armadilha[\s\S]*?(?=## |$)/i)?.[0]

  return {
    prioritarias: pri ? parsePriorityTable(pri, "prioritarias") : [],
    secundarias: sec ? parsePriorityTable(sec, "secundarias") : [],
    armadilha: arm ? parsePriorityTable(arm, "armadilha") : [],
  }
}

function parseStudyOrder(md: string): StrategicStudyStep[] {
  const section = extractSection(md, "SUGESTAO DE ORDEM DE ESTUDO")
  const out: StrategicStudyStep[] = []
  const phases = section.split(/(?=### Fase )/gi)
  for (const phase of phases) {
    const faseM = phase.match(/### Fase (\d+)/i)
    const fase = faseM ? `Fase ${faseM[1]}` : "Fase"
    const table = phase.match(/\|[\s\S]*?\|/)?.[0] ? phase : ""
    for (const row of parseTableRows(phase)) {
      if (row.length < 4) continue
      const slug = row[1] ?? row[0]
      if (!slug || slug === "etapa" || slug === "slug") continue
      out.push({
        fase,
        etapa: row[0]!,
        slug: slug!,
        name: row[2] ?? row[1]!,
        descricao: row[3],
      })
    }
  }
  return out
}

function parseStudyHours(md: string) {
  const section = extractSection(md, "LISTA DE PRIORIDADE PRATICA DE ESTUDOS")
  const out: { ordem: number; slug: string; name: string; horas_minimas?: number }[] = []
  for (const row of parseTableRows(section)) {
    if (row.length < 4) continue
    const slug = row[1] ?? row[0]
    if (!slug || slug === "slug" || slug === "ordem") continue
    out.push({
      ordem: parseNum(row[0] ?? "") ?? out.length + 1,
      slug: slug!,
      name: row[2] ?? row[1]!,
      horas_minimas: parseNum(row[5] ?? row[4] ?? ""),
    })
  }
  return out
}

function parseAlerts(md: string): StrategicAlert[] {
  const section = extractSection(md, "ALERTAS ESTRATEGICOS")
  const out: StrategicAlert[] = []
  for (const row of parseTableRows(section)) {
    if (row.length < 2) continue
    if (row[0]?.toLowerCase() === "alerta") continue
    out.push({ alerta: row[0]!, descricao: row[1]! })
  }
  return out
}

export function parseStrategicMd(text: string): StrategicMdBundle {
  const warnings: string[] = []
  const md = text.replace(/\r\n/g, "\n")

  if (!/## METADADOS/i.test(md)) warnings.push("Seção METADADOS ausente")
  if (!/## RANKING DE RELEVANCIA/i.test(md)) warnings.push("Seção RANKING DE RELEVANCIA ausente")
  if (!/## MAPA DE INCIDENCIA/i.test(md)) warnings.push("Seção MAPA DE INCIDENCIA ausente")

  const metadata = parseKeyValueTable(extractSection(md, "METADADOS"))
  const edital_subjects = parseEditalSubjects(md)
  const subject_ranking = parseSubjectRanking(md)
  const incidence_subjects = parseIncidenceSubjects(md)
  const topics_by_slug = parseTopicsBySlug(md)

  for (const s of edital_subjects) {
    if (!topics_by_slug[s.slug]?.length) {
      warnings.push(`Sem tabela de tópicos: ${s.name} (${s.slug})`)
    }
  }

  if (!edital_subjects.length) warnings.push("Nenhuma matéria do edital (P1/P2) encontrada")
  if (!subject_ranking.length) warnings.push("Ranking de matérias vazio")

  return {
    metadata,
    edital_subjects,
    subject_ranking,
    incidence_subjects,
    topics_by_slug,
    priorities: parsePriorities(md),
    study_order: parseStudyOrder(md),
    study_hours: parseStudyHours(md),
    alerts: parseAlerts(md),
    parse_warnings: warnings,
  }
}

export function validateStrategicMd(bundle: StrategicMdBundle): string | null {
  if (!bundle.edital_subjects.length && !bundle.subject_ranking.length) {
    return "MD inválido: faltam matérias do edital e ranking."
  }
  if (!bundle.incidence_subjects.length) {
    return "MD inválido: faltam dados de incidência por matéria."
  }
  return null
}
