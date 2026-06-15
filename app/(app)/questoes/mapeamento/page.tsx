"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Trash2 } from "lucide-react"
import TecOrganizePanel from "@/components/questions/TecOrganizePanel"

type TecSubjectOverview = {
  tec_subject: string
  question_count: number
  sample_statement: string
  topics_preview: string[]
  subject_mapped: boolean
  mapped_subject_id: string | null
  mapped_subject_name: string | null
  mapped_topics: number
  total_topics: number
  has_tree: boolean
}

type SubjectFilter = "all" | "pending" | "mapped"

type TecTopicGroup = {
  tec_subject: string
  tec_topic: string
  count: number
  sample_statement: string
  mapped_subject_id: string | null
  mapped_subject_name: string | null
}

type Subject = { id: string; name: string }
type Topic = { id: string; name: string }

type Tab = "subjects" | "topics" | "organize" | "mapped"

type MappingProgress = {
  tec_subject: string
  total_topics: number
  mapped_topics: number
  subject_mapped: boolean
}

type MappedRow = {
  id: string
  tec_subject: string
  tec_topic: string
  is_subject_level?: boolean
  subject_name: string | null
  topic_name: string | null
}

type TecTopicGroupBlock = {
  tec_subject: string
  topics: TecTopicGroup[]
}

export default function MapeamentoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("subjects")
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectsOverview, setSubjectsOverview] = useState<TecSubjectOverview[]>([])
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("all")
  const [unmappedTopics, setUnmappedTopics] = useState<TecTopicGroup[]>([])
  const [unmappedTopicGroups, setUnmappedTopicGroups] = useState<TecTopicGroupBlock[]>(
    []
  )
  const [selectedSubject, setSelectedSubject] = useState<TecSubjectOverview | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<TecTopicGroup | null>(null)
  const [yourSubjectId, setYourSubjectId] = useState("")
  const [targetSubjectId, setTargetSubjectId] = useState("")
  const [yourTopicId, setYourTopicId] = useState("")
  const [topics, setTopics] = useState<Topic[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<MappingProgress[]>([])
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])

  const reload = useCallback(async (uid: string) => {
    const [overview, t, g, p, m] = await Promise.all([
      fetch(`/api/questions/mappings?user_id=${uid}&unmapped=subjects_overview`).then(
        (r) => r.json()
      ),
      fetch(`/api/questions/mappings?user_id=${uid}&unmapped=topics`).then((r) =>
        r.json()
      ),
      fetch(`/api/questions/mappings?user_id=${uid}&unmapped=topics_grouped`).then((r) =>
        r.json()
      ),
      fetch(`/api/questions/mappings?user_id=${uid}&unmapped=progress`).then((r) =>
        r.json()
      ),
      fetch(`/api/questions/mappings?user_id=${uid}&unmapped=mapped`).then((r) =>
        r.json()
      ),
    ])
    setSubjectsOverview(Array.isArray(overview) ? overview : [])
    setUnmappedTopics(Array.isArray(t) ? t : [])
    setUnmappedTopicGroups(Array.isArray(g) ? g : [])
    setProgress(Array.isArray(p) ? p : [])
    setMappedRows(Array.isArray(m) ? m : [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then(setSubjects)
    })
  }, [router, reload])

  useEffect(() => {
    const sid = targetSubjectId || yourSubjectId
    if (!userId || !sid) {
      setTopics([])
      return
    }
    fetch(`/api/topics?user_id=${userId}&subject_id=${sid}`)
      .then((r) => r.json())
      .then(setTopics)
  }, [userId, yourSubjectId, targetSubjectId])

  async function saveSubjectLink() {
    if (!userId || !selectedSubject || !yourSubjectId) return
    setSaving(true)
    setMessage(null)
    const res = await fetch("/api/questions/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subject",
        user_id: userId,
        tec_subject: selectedSubject.tec_subject,
        subject_id: yourSubjectId,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data.error ?? "Erro ao salvar")
      setSaving(false)
      return
    }
    setMessage(
      `“${selectedSubject.tec_subject}” vinculada — ${selectedSubject.question_count} questões usam essa matéria. Assuntos com tema de mesmo nome na sua matéria serão reconhecidos automaticamente.`
    )
    setSelectedSubject(null)
    setYourSubjectId("")
    await reload(userId)
    setSaving(false)
  }

  async function saveTopicLink(createNew: boolean) {
    if (!userId || !selectedTopic) return
    const destSubjectId = targetSubjectId || yourSubjectId
    if (!destSubjectId) {
      setMessage("Selecione a matéria de destino.")
      return
    }
    setSaving(true)
    setMessage(null)
    const body = createNew
      ? {
          type: "topic_create",
          user_id: userId,
          tec_subject: selectedTopic.tec_subject,
          tec_topic: selectedTopic.tec_topic,
          subject_id: destSubjectId,
        }
      : {
          type: "topic",
          user_id: userId,
          tec_subject: selectedTopic.tec_subject,
          tec_topic: selectedTopic.tec_topic,
          topic_id: yourTopicId,
          subject_id: destSubjectId,
        }
    const res = await fetch("/api/questions/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(data.error ?? "Erro ao salvar")
      setSaving(false)
      return
    }
    setMessage(`Assunto “${selectedTopic.tec_topic}” associado.`)
    setSelectedTopic(null)
    setYourTopicId("")
    setTargetSubjectId("")
    await reload(userId)
    setSaving(false)
  }

  const pendingSubjectCount = subjectsOverview.filter((s) => !s.subject_mapped).length
  const filteredSubjects = subjectsOverview.filter((s) => {
    if (subjectFilter === "pending") return !s.subject_mapped
    if (subjectFilter === "mapped") return s.subject_mapped
    return true
  })

  async function bulkMapByName(tecSubject: string) {
    if (!userId) return
    setSaving(true)
    const res = await fetch("/api/questions/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bulk_by_name",
        user_id: userId,
        tec_subject: tecSubject,
      }),
    })
    const data = await res.json()
    setMessage(`Mapeados ${data.mapped ?? 0} assuntos por nome (${data.skipped ?? 0} sem tema igual).`)
    await reload(userId)
    setSaving(false)
  }

  async function deleteMapping(id: string) {
    if (!userId || !confirm("Remover este vínculo?")) return
    await fetch(`/api/questions/mappings?id=${id}`, { method: "DELETE" })
    await reload(userId)
  }

  const panelItem = tab === "subjects" ? selectedSubject : tab === "topics" ? selectedTopic : null

  return (
    <div className="p-6">
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Associar matérias e assuntos</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Cada <strong>matéria TEC</strong> traz os <strong>assuntos</strong> dela no PDF. Vincule a
        matéria à sua uma vez — todas as questões dessa matéria passam para ela. Depois vincule
        cada <strong>assunto</strong> ao seu tema (ou crie um novo). Se já existir um tema com o
        mesmo nome na sua matéria, o app associa automaticamente ao resolver/importar.
      </p>

      <div className="mt-4 flex gap-2 border-b">
        <button
          type="button"
          onClick={() => {
            setTab("subjects")
            setSelectedTopic(null)
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "subjects"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500"
          }`}
        >
          Matérias TEC ({pendingSubjectCount} pendentes)
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("topics")
            setSelectedSubject(null)
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "topics"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500"
          }`}
        >
          Assuntos TEC ({unmappedTopics.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("organize")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "organize"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500"
          }`}
        >
          Organizar
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("mapped")
            setSelectedSubject(null)
            setSelectedTopic(null)
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "mapped"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500"
          }`}
        >
          Já mapeados ({mappedRows.length})
        </button>
      </div>

      {progress.length > 0 && tab !== "organize" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {progress.slice(0, 8).map((p) => (
            <span
              key={p.tec_subject}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
            >
              {p.tec_subject}: {p.mapped_topics}/{p.total_topics}
            </span>
          ))}
        </div>
      )}

      {tab === "organize" && userId && (
        <div className="mt-6">
          <TecOrganizePanel userId={userId} />
        </div>
      )}

      {tab === "mapped" && (
        <ul className="mt-6 max-h-[70vh] space-y-2 overflow-y-auto">
          {mappedRows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                {row.is_subject_level ? (
                  <>
                    <p className="text-xs text-slate-500">Matéria TEC</p>
                    <p className="font-medium">{row.tec_subject}</p>
                    <p className="text-xs text-slate-400">→ {row.subject_name}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">{row.tec_subject}</p>
                    <p className="font-medium">{row.tec_topic}</p>
                    <p className="text-xs text-slate-400">
                      → {row.subject_name} / {row.topic_name}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteMapping(row.id)}
                className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {mappedRows.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum assunto mapeado ainda.</p>
          )}
        </ul>
      )}

      {tab !== "organize" && tab !== "mapped" && (
        <>
          {message && (
            <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
              {message}
            </p>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              {tab === "subjects" && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "Todas"],
                      ["pending", "Pendentes"],
                      ["mapped", "Vinculadas"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSubjectFilter(key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        subjectFilter === key
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
              {tab === "subjects" &&
                filteredSubjects.map((u) => (
                  <li key={u.tec_subject}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubject(u)
                        setYourSubjectId(u.mapped_subject_id ?? "")
                      }}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                        selectedSubject?.tec_subject === u.tec_subject
                          ? "border-blue-500 bg-blue-50"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-blue-800">{u.tec_subject}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            u.subject_mapped
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {u.subject_mapped ? "Vinculada" : "Pendente"}
                        </span>
                        {u.has_tree && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-800">
                            Organizada
                          </span>
                        )}
                      </div>
                      {u.mapped_subject_name && (
                        <p className="mt-1 text-xs text-slate-600">
                          → {u.mapped_subject_name}
                        </p>
                      )}
                      {u.sample_statement && (
                        <p className="mt-1 line-clamp-2 text-slate-600">{u.sample_statement}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        {u.question_count} questões
                        {u.total_topics > 0 &&
                          ` · ${u.mapped_topics}/${u.total_topics} assuntos`}
                      </p>
                      {u.total_topics > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${Math.round((u.mapped_topics / u.total_topics) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              {tab === "subjects" && filteredSubjects.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhuma matéria neste filtro.
                </p>
              )}

              {tab === "topics" &&
                unmappedTopicGroups.map((group) => (
                  <li key={group.tec_subject} className="rounded-lg border bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <p className="text-sm font-semibold text-blue-800">
                        {group.tec_subject}
                        {!group.topics[0]?.mapped_subject_name && (
                          <span className="ml-2 text-xs font-normal text-amber-700">
                            (vincule a matéria antes)
                          </span>
                        )}
                        {group.topics[0]?.mapped_subject_name && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            → {group.topics[0].mapped_subject_name}
                          </span>
                        )}
                      </p>
                      {group.topics[0]?.mapped_subject_name && (
                        <button
                          type="button"
                          onClick={() => bulkMapByName(group.tec_subject)}
                          disabled={saving}
                          className="text-xs text-violet-700 hover:underline"
                        >
                          Mapear por nome
                        </button>
                      )}
                    </div>
                    <ul className="mt-2 space-y-2">
                      {group.topics.map((u) => (
                        <li key={`${u.tec_subject}|||${u.tec_topic}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTopic(u)
                              setYourTopicId("")
                              setTargetSubjectId(u.mapped_subject_id ?? "")
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                              selectedTopic?.tec_topic === u.tec_topic &&
                              selectedTopic?.tec_subject === u.tec_subject
                                ? "border-blue-500 bg-blue-50"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            <p className="font-medium text-slate-900">{u.tec_topic}</p>
                            <p className="mt-1 text-xs text-slate-400">{u.count} questões</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              {tab === "topics" && unmappedTopics.length === 0 && (
                <p className="text-sm text-green-700">Todos os assuntos TEC já foram vinculados.</p>
              )}
              </ul>
            </div>

            <div className="rounded-xl border bg-white p-4 lg:sticky lg:top-4 lg:self-start">
              {tab === "subjects" && selectedSubject && (
                <>
                  <p className="text-lg font-semibold text-blue-800">
                    {selectedSubject.tec_subject}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Todas as {selectedSubject.question_count} questões com esta matéria no TEC irão
                    para a matéria que você escolher abaixo.
                    {selectedSubject.subject_mapped && " Você pode alterar o vínculo existente."}
                  </p>
                  <label className="mt-4 block text-sm font-medium">Sua matéria</label>
                  <select
                    value={yourSubjectId}
                    onChange={(e) => setYourSubjectId(e.target.value)}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveSubjectLink}
                    disabled={!yourSubjectId || saving}
                    className="mt-4 w-full rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Salvar vínculo da matéria
                  </button>
                </>
              )}

              {tab === "topics" && selectedTopic && (
                <>
                  <p className="text-xs text-slate-500">{selectedTopic.tec_subject}</p>
                  <p className="text-lg font-semibold">{selectedTopic.tec_topic}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedTopic.count} questões com este assunto.
                  </p>
                  <label className="mt-4 block text-sm font-medium">Enviar para matéria</label>
                  <select
                    value={targetSubjectId}
                    onChange={(e) => {
                      setTargetSubjectId(e.target.value)
                      setYourTopicId("")
                    }}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.id === selectedTopic.mapped_subject_id ? " (padrão TEC)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Use quando o assunto TEC pertence a uma matéria sua diferente da matéria TEC
                    pai (ex.: Reforma Tributária dentro de Direito Tributário).
                  </p>
                  {targetSubjectId && (
                    <>
                      <label className="mt-4 block text-sm font-medium">
                        Associar a um tema existente
                      </label>
                      <select
                        value={yourTopicId}
                        onChange={(e) => setYourTopicId(e.target.value)}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm"
                      >
                        <option value="">Selecione (se já tiver um tema igual)</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveTopicLink(false)}
                        disabled={!yourTopicId || saving}
                        className="mt-2 w-full rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                      >
                        Usar tema selecionado
                      </button>
                      <div className="my-4 border-t" />
                      <p className="text-sm text-slate-600">
                        Ou crie um tema novo com o nome do TEC:
                      </p>
                      <button
                        type="button"
                        onClick={() => saveTopicLink(true)}
                        disabled={saving}
                        className="mt-2 w-full rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        Criar tema “{selectedTopic.tec_topic}”
                      </button>
                    </>
                  )}
                </>
              )}

              {!panelItem && (
                <p className="text-sm text-slate-500">
                  Selecione um item à esquerda para associar.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
