import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { CycleStats } from "./study-cycle-deadline-planner"
import { WEEKDAY_LABELS } from "./study-cycle-planner"
import { groupDaysIntoWeeks } from "./study-cycle-week-utils"
import type {
  StudyCycle,
  StudyCycleBlock,
  StudyCycleContentBlock,
} from "./study-cycle-types"

export type StudyCyclePdfInput = {
  cycle: StudyCycle
  stats: CycleStats | null
  cycleEnabled: boolean
  generatedAt: Date
}

const SUBJECT_COLORS = [
  { bg: "#ccfbf1", border: "#99f6e4", text: "#115e59" },
  { bg: "#ede9fe", border: "#ddd6fe", text: "#5b21b6" },
  { bg: "#fef3c7", border: "#fde68a", text: "#92400e" },
  { bg: "#e0f2fe", border: "#bae6fd", text: "#0c4a6e" },
  { bg: "#ffe4e6", border: "#fecdd3", text: "#9f1239" },
  { bg: "#d1fae5", border: "#a7f3d0", text: "#065f46" },
]

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 14,
    marginBottom: 8,
    color: "#0f172a",
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 8,
  },
  statLabel: { fontSize: 8, color: "#64748b", marginBottom: 2 },
  statValue: { fontSize: 11, fontWeight: "bold" },
  statHint: { fontSize: 7, color: "#94a3b8", marginTop: 2 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 4,
  },
  th: { fontSize: 8, color: "#64748b", fontWeight: "bold" },
  td: { fontSize: 8 },
  warning: { fontSize: 9, color: "#dc2626", marginTop: 6 },
  note: { fontSize: 9, color: "#b45309", marginTop: 8, marginBottom: 8 },
  contentSubject: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  contentBlock: { fontSize: 8, marginLeft: 8, marginBottom: 3, color: "#334155" },
  weekTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, marginTop: 4 },
  gridHeader: { flexDirection: "row", marginBottom: 4 },
  gridRow: { flexDirection: "row", minHeight: 72 },
  gridCell: {
    width: "14.28%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 3,
    minHeight: 72,
  },
  gridCellHeader: {
    width: "14.28%",
    fontSize: 7,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
  },
  cellDayLabel: { fontSize: 6, color: "#94a3b8", marginBottom: 2 },
  blockCard: {
    borderWidth: 1,
    borderRadius: 2,
    padding: 2,
    marginBottom: 2,
  },
  blockSubject: { fontSize: 6, fontWeight: "bold" },
  blockLabel: { fontSize: 6, color: "#475569" },
  blockBadges: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 1 },
  badge: { fontSize: 5, backgroundColor: "#ffffff99", paddingHorizontal: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  emptyCell: { fontSize: 7, color: "#cbd5e1" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
  },
})

function statusLabel(cycle: StudyCycle, cycleEnabled: boolean): string {
  if (cycle.status === "completed") return "Concluído"
  if (cycleEnabled && cycle.status === "active") return "Ativo"
  if (cycle.status === "paused") return "Pausado"
  return "Rascunho"
}

function planningModeLabel(mode?: string): string {
  return mode === "deadline_driven" ? "Completar em X meses" : "Tempo livre"
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "ciclo"
}

export function studyCyclePdfFilename(cycle: StudyCycle, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10)
  return `plano-ciclo-${slugify(cycle.name ?? "ciclo")}-${date}.pdf`
}

function StatsSection({ stats }: { stats: CycleStats }) {
  const pct =
    stats.minutes_total_available > 0
      ? Math.round(
          (stats.minutes_total_required / stats.minutes_total_available) * 100
        )
      : 0

  return (
    <View>
      <Text style={styles.sectionTitle}>Resumo do ciclo</Text>
      <Text style={{ fontSize: 8, color: "#64748b", marginBottom: 8 }}>
        Configuração da semana: {stats.weekday_minutes_label} ·{" "}
        {stats.active_days_per_week} dias ativos · ~{stats.minutes_per_week_available}{" "}
        min/semana
      </Text>
      <View style={styles.row}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Sessões totais</Text>
          <Text style={styles.statValue}>{stats.total_sessions}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Capacidade no prazo</Text>
          <Text style={styles.statValue}>{stats.sessions_capacity_in_period}</Text>
          <Text style={styles.statHint}>
            {stats.total_sessions} necessárias · ~
            {Math.round(stats.minutes_total_available / 60)} h
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Por mini-ciclo</Text>
          <Text style={styles.statValue}>{stats.mini_cycle_sessions}</Text>
          <Text style={styles.statHint}>
            {stats.mini_cycles_to_complete} mini-ciclos
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Prazo sugerido</Text>
          <Text style={styles.statValue}>{stats.suggested_weeks} sem</Text>
          <Text style={styles.statHint}>
            {stats.feasible
              ? "Cabe no prazo atual"
              : `Sugestão: ~${stats.suggested_weeks} sem (hoje: ${stats.target_weeks})`}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 8, marginTop: 4 }}>
        Uso do tempo: {Math.round(stats.minutes_total_required / 60)} h /{" "}
        {Math.round(stats.minutes_total_available / 60)} h ({pct}%)
      </Text>
      {stats.warning ? <Text style={styles.warning}>{stats.warning}</Text> : null}
      {!stats.feasible && stats.suggested_weeks > 0 ? (
        <Text style={{ fontSize: 8, marginTop: 4 }}>
          Média de ~{stats.sessions_per_day} sessões/dia ({stats.minutes_per_day_required}{" "}
          min) vs {stats.minutes_per_day_available} min/dia em média.
        </Text>
      ) : null}
      {stats.per_subject.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: "35%" }]}>Matéria</Text>
            <Text style={[styles.th, { width: "15%" }]}>Blocos</Text>
            <Text style={[styles.th, { width: "15%" }]}>Peso</Text>
            <Text style={[styles.th, { width: "17%" }]}>Sessões</Text>
            <Text style={[styles.th, { width: "18%" }]}>/semana</Text>
          </View>
          {stats.per_subject.map((s) => (
            <View key={s.subject_id} style={styles.tableRow}>
              <Text style={[styles.td, { width: "35%" }]}>
                {s.subject_name ?? s.subject_id}
              </Text>
              <Text style={[styles.td, { width: "15%" }]}>{s.block_count}</Text>
              <Text style={[styles.td, { width: "15%" }]}>×{s.weight}</Text>
              <Text style={[styles.td, { width: "17%" }]}>{s.total_sessions}</Text>
              <Text style={[styles.td, { width: "18%" }]}>
                {s.sessions_per_week_needed}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function WeekdayLimitsSection({ cycle }: { cycle: StudyCycle }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Disponibilidade semanal</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: "25%" }]}>Dia</Text>
        <Text style={[styles.th, { width: "25%" }]}>Ativo</Text>
        <Text style={[styles.th, { width: "25%" }]}>Minutos</Text>
        <Text style={[styles.th, { width: "25%" }]}>Questões/dia</Text>
      </View>
      {cycle.weekday_limits.map((w) => (
        <View key={w.weekday} style={styles.tableRow}>
          <Text style={[styles.td, { width: "25%" }]}>
            {WEEKDAY_LABELS[w.weekday]}
          </Text>
          <Text style={[styles.td, { width: "25%" }]}>
            {w.active ? "Sim" : "Não"}
          </Text>
          <Text style={[styles.td, { width: "25%" }]}>{w.minutes}</Text>
          <Text style={[styles.td, { width: "25%" }]}>
            {w.daily_limits?.questions ?? "—"}
          </Text>
        </View>
      ))}
    </View>
  )
}

function ContentSection({
  cycle,
  contentBlocks,
}: {
  cycle: StudyCycle
  contentBlocks: StudyCycleContentBlock[]
}) {
  if (!contentBlocks.length) return null

  const bySubject = cycle.subjects.map((s) => ({
    subject: s,
    blocks: contentBlocks.filter((b) => b.subject_id === s.subject_id),
  }))

  return (
    <View>
      <Text style={styles.sectionTitle}>Conteúdo por matéria</Text>
      {bySubject.map(({ subject, blocks }) =>
        blocks.length ? (
          <View key={subject.subject_id}>
            <Text style={styles.contentSubject}>
              {subject.subject_name ?? subject.subject_id}
            </Text>
            {blocks.map((b) => (
              <Text key={b.id} style={styles.contentBlock}>
                • {b.name} ({b.estimated_minutes} min)
                {b.topics.length
                  ? ` — ${b.topics.map((t) => t.tec_topic).join(", ")}`
                  : b.study_note?.trim()
                    ? ` — ${b.study_note.trim()}`
                    : ""}
              </Text>
            ))}
          </View>
        ) : null
      )}
    </View>
  )
}

function BlockCardPdf({
  block,
  color,
  weight,
  subjectName,
}: {
  block: StudyCycleBlock
  color: (typeof SUBJECT_COLORS)[0]
  weight: number
  subjectName?: string
}) {
  const miniCycle = block.params.mini_cycle_index
  const pass = block.params.block_pass

  return (
    <View
      style={[
        styles.blockCard,
        {
          backgroundColor: color.bg,
          borderColor: color.border,
        },
      ]}
    >
      <Text style={[styles.blockSubject, { color: color.text }]}>
        {subjectName ?? block.label}
      </Text>
      <Text style={styles.blockLabel}>{block.label}</Text>
      <View style={styles.blockBadges}>
        <Text style={styles.badge}>×{weight}</Text>
        {pass != null ? <Text style={styles.badge}>{pass}ª pass</Text> : null}
        {miniCycle != null ? (
          <Text style={styles.badge}>mc{miniCycle + 1}</Text>
        ) : null}
      </View>
    </View>
  )
}

function ScheduleSection({ cycle }: { cycle: StudyCycle }) {
  if (!cycle.days.length) {
    return (
      <Text style={styles.note}>
        Grade ainda não gerada. Use Planejar ciclo para gerar o calendário.
      </Text>
    )
  }

  const colorMap = new Map<string, (typeof SUBJECT_COLORS)[0]>()
  cycle.subjects.forEach((s, i) => {
    colorMap.set(s.subject_id, SUBJECT_COLORS[i % SUBJECT_COLORS.length])
  })
  const weightMap = new Map(
    cycle.subjects.map((s) => [s.subject_id, s.weight ?? s.times_in_cycle ?? 1])
  )

  const weeks = groupDaysIntoWeeks(cycle.days, cycle.weekday_limits)

  return (
    <View>
      <Text style={styles.sectionTitle}>Grade do ciclo</Text>
      <View style={styles.legend}>
        {cycle.subjects.map((s, i) => {
          const c = SUBJECT_COLORS[i % SUBJECT_COLORS.length]
          return (
            <View key={s.subject_id} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }]} />
              <Text style={{ fontSize: 7 }}>{s.subject_name ?? s.subject_id}</Text>
            </View>
          )
        })}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} break={wi > 0}>
          <Text style={styles.weekTitle}>Semana {wi + 1}</Text>
          <View style={styles.gridHeader}>
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
              <Text key={wd} style={styles.gridCellHeader}>
                {WEEKDAY_LABELS[wd]}
              </Text>
            ))}
          </View>
          <View style={styles.gridRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const day = week.find((d) => d.weekday === wd)
              return (
                <View key={wd} style={styles.gridCell}>
                  {day ? (
                    day.blocks.map((block, bi) => (
                      <BlockCardPdf
                        key={bi}
                        block={block}
                        color={
                          colorMap.get(block.subject_id) ?? SUBJECT_COLORS[0]
                        }
                        weight={weightMap.get(block.subject_id) ?? 1}
                        subjectName={block.subject_name}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyCell}>—</Text>
                  )}
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

function StudyCyclePdfDocument({ input }: { input: StudyCyclePdfInput }) {
  const { cycle, stats, cycleEnabled, generatedAt } = input
  const contentBlocks = cycle.content_blocks ?? []

  return (
    <Document title={`Plano — ${cycle.name}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Plano de ciclo de estudos</Text>
        <Text style={styles.subtitle}>
          {cycle.name} · Gerado em {formatDate(generatedAt)}
        </Text>
        <Text style={{ fontSize: 9, marginBottom: 8 }}>
          Status: {statusLabel(cycle, cycleEnabled)} · Modo:{" "}
          {planningModeLabel(cycle.planning_mode)}
          {cycle.planning_mode === "deadline_driven" && cycle.target_weeks
            ? ` · Prazo ${cycle.target_weeks} sem`
            : ""}
          {cycle.default_block_minutes
            ? ` · ${cycle.default_block_minutes} min/bloco`
            : ""}
          {cycle.total_days
            ? ` · ${cycle.total_days} dias · dia atual ${cycle.current_day_index + 1}`
            : ""}
        </Text>

        {stats ? <StatsSection stats={stats} /> : null}
        <WeekdayLimitsSection cycle={cycle} />

        <Text style={styles.footer} fixed>
          app-concurso · Plano de ciclo
        </Text>
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <ContentSection cycle={cycle} contentBlocks={contentBlocks} />
        <ScheduleSection cycle={cycle} />
        <Text style={styles.footer} fixed>
          app-concurso · Plano de ciclo
        </Text>
      </Page>
    </Document>
  )
}

export async function renderStudyCyclePdfBuffer(
  input: StudyCyclePdfInput
): Promise<Buffer> {
  const buf = await renderToBuffer(<StudyCyclePdfDocument input={input} />)
  return Buffer.from(buf)
}
