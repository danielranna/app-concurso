"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Upload, X, XCircle } from "lucide-react"
import NotebookFolderSelect from "@/components/questions/NotebookFolderSelect"
import {
  runImportQueue,
  type ImportQueueItem,
  type ImportQueueState,
} from "@/lib/import-pdf-queue"

type Subject = { id: string; name: string }

type Props = {
  userId: string
  subjects: Subject[]
  subjectId: string
  onSubjectIdChange: (id: string) => void
  folderId: string
  onFolderIdChange: (id: string) => void
}

function statusIcon(status: ImportQueueItem["status"]) {
  if (status === "done") return <Check className="h-4 w-4 text-green-600" />
  if (status === "error") return <XCircle className="h-4 w-4 text-red-600" />
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
  if (status === "cancelled") return <X className="h-4 w-4 text-slate-400" />
  return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
}

export default function BulkImportPanel({
  userId,
  subjects,
  subjectId,
  onSubjectIdChange,
  folderId,
  onFolderIdChange,
}: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [queueState, setQueueState] = useState<ImportQueueState | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const finished = queueState && !queueState.running
  const progressPct =
    queueState && queueState.total > 0
      ? Math.round((queueState.completed / queueState.total) * 100)
      : 0

  const okCount = queueState?.items.filter((i) => i.status === "done").length ?? 0
  const errCount = queueState?.items.filter((i) => i.status === "error").length ?? 0

  function handleFileChange(list: FileList | null) {
    if (!list?.length) {
      setFiles([])
      return
    }
    setFiles(Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".pdf")))
    setQueueState(null)
  }

  async function startImport() {
    if (!files.length) return
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setQueueState(null)

    await runImportQueue({
      files,
      userId,
      subjectId: subjectId || null,
      folderId: subjectId && folderId ? folderId : null,
      signal: controller.signal,
      onProgress: setQueueState,
    })

    setRunning(false)
    abortRef.current = null
  }

  function cancelImport() {
    abortRef.current?.abort()
  }

  function reset() {
    setFiles([])
    setQueueState(null)
    abortRef.current?.abort()
    setRunning(false)
  }

  const subjectName = subjects.find((s) => s.id === subjectId)?.name

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
        <p>
          Importação rápida em fila: <strong>um PDF por vez</strong>, usando o mesmo parser do
          wizard. Todas as questões com gabarito entram no caderno — sem revisão nem vínculo de
          conteúdo.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Para revisar ou vincular textos, use o modo &quot;Um PDF&quot;.
        </p>
      </div>

      {!running && !finished && (
        <>
          <div>
            <label className="text-sm font-medium">Arquivos PDF</label>
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => handleFileChange(e.target.files)}
              className="mt-1 block w-full text-sm"
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">{files.length} arquivo(s) selecionado(s)</p>
            )}
          </div>

          {subjects.length > 0 && (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-500">Organizar nesta matéria (opcional)</span>
                <select
                  value={subjectId}
                  onChange={(e) => {
                    onSubjectIdChange(e.target.value)
                    onFolderIdChange("")
                  }}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                >
                  <option value="">Deixar em Importados</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {subjectId && (
                <NotebookFolderSelect
                  userId={userId}
                  subjectId={subjectId}
                  value={folderId}
                  onChange={onFolderIdChange}
                />
              )}
            </div>
          )}

          <button
            type="button"
            onClick={startImport}
            disabled={!files.length}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Iniciar importação ({files.length || 0})
          </button>
        </>
      )}

      {(running || finished) && queueState && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {queueState.running
                  ? queueState.currentFileName
                    ? `Processando: ${queueState.currentFileName}`
                    : "Aguardando próximo…"
                  : queueState.cancelled
                    ? "Importação cancelada"
                    : "Importação concluída"}
              </span>
              <span className="font-medium text-slate-700">
                {queueState.completed}/{queueState.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">{progressPct}%</p>
          </div>

          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border bg-white p-2 text-sm">
            {queueState.items.map((item) => (
              <li
                key={item.fileName}
                className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="mt-0.5 shrink-0">{statusIcon(item.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{item.fileName}</p>
                  {item.status === "done" && item.result && (
                    <p className="text-xs text-slate-500">
                      {item.result.parsed_name} · {item.result.notebook_question_count} questões
                    </p>
                  )}
                  {item.status === "error" && (
                    <p className="text-xs text-red-600">{item.error}</p>
                  )}
                  {item.status === "cancelled" && (
                    <p className="text-xs text-slate-400">Cancelado</p>
                  )}
                </div>
                {item.status === "done" && item.result?.notebook_id && (
                  <Link
                    href={`/questoes/cadernos/${item.result.notebook_id}`}
                    className="shrink-0 text-xs text-blue-600 underline"
                  >
                    Abrir
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {running && (
            <button
              type="button"
              onClick={cancelImport}
              className="rounded border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Cancelar (após o PDF atual)
            </button>
          )}

          {finished && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
              <p className="font-medium text-green-900">
                {okCount} caderno(s) importado(s)
                {errCount > 0 && ` · ${errCount} com erro`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {subjectId ? (
                  <Link
                    href={
                      folderId
                        ? `/questoes/materia/${subjectId}/pastas/${folderId}`
                        : `/questoes/materia/${subjectId}`
                    }
                    className="text-blue-600 underline"
                  >
                    Ver em {subjectName ?? "matéria"}
                  </Link>
                ) : (
                  <Link href="/questoes/importados" className="text-blue-600 underline">
                    Ver em Importados
                  </Link>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="text-blue-600 underline"
                >
                  Importar mais PDFs
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
