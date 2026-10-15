import React from "react"
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer"

export type AgendaPdfField = { label: string; value: string }

export type AgendaPdfSheet = {
  title: string
  past: boolean
  fields: AgendaPdfField[]
  notes: string | null
}

export type AgendaPdfInput = {
  generatedAt: Date
} & (
  | { mode: "single"; kindName: string | null; sheet: AgendaPdfSheet }
  | { mode: "compiled"; kindName: string; includePast: boolean; sheets: AgendaPdfSheet[] }
)

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 14 },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  past: { fontSize: 8, color: "#b45309", marginBottom: 6 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 3,
  },
  label: { width: "42%", color: "#64748b" },
  value: { width: "58%" },
  notes: { marginTop: 8, fontSize: 9, color: "#334155" },
  empty: { fontSize: 10, color: "#64748b" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#94a3b8",
  },
})

function formatGenerated(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function SheetBlock({ sheet }: { sheet: AgendaPdfSheet }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{sheet.title}</Text>
      {sheet.past && <Text style={styles.past}>Já passou</Text>}
      {sheet.fields.map((field, index) => (
        <View key={`${field.label}-${index}`} style={styles.row}>
          <Text style={styles.label}>{field.label}</Text>
          <Text style={styles.value}>{field.value}</Text>
        </View>
      ))}
      {sheet.notes ? <Text style={styles.notes}>Nota: {sheet.notes}</Text> : null}
    </View>
  )
}

function AgendaPdfDocument({ input }: { input: AgendaPdfInput }) {
  const generated = `Gerado em ${formatGenerated(input.generatedAt)}`
  if (input.mode === "single") {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>{input.sheet.title}</Text>
          <Text style={styles.subtitle}>
            {input.kindName ?? "Pontual"} · {generated}
          </Text>
          <SheetBlock sheet={input.sheet} />
          <Text
            style={styles.footer}
            fixed
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </Page>
      </Document>
    )
  }

  const openCount = input.sheets.filter((sheet) => !sheet.past).length
  const scope = input.includePast
    ? "incluindo os que já passaram"
    : "somente os que ainda têm alguma data por vir"
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{input.kindName}</Text>
        <Text style={styles.subtitle}>
          Compilado · {input.sheets.length} {input.sheets.length === 1 ? "registro" : "registros"} · {openCount} em aberto · {scope}. {generated}
        </Text>
        {input.sheets.length === 0 ? (
          <Text style={styles.empty}>Nenhum registro neste compilado.</Text>
        ) : (
          input.sheets.map((sheet, index) => <SheetBlock key={`${sheet.title}-${index}`} sheet={sheet} />)
        )}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

export async function renderAgendaPdfBuffer(input: AgendaPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<AgendaPdfDocument input={input} />)
  return Buffer.from(buf)
}

export function agendaPdfFilename(name: string, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10)
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "evento"
  return `${slug}-${date}.pdf`
}
