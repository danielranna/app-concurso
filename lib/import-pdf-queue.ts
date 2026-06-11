export type QueueItemStatus = "pending" | "running" | "done" | "error" | "cancelled"

export type QuickImportResult = {
  file_name: string
  parsed_name: string
  notebook_id: string
  notebook_question_count: number
  created_questions: number
  reused_questions: number
  updated_questions: number
  warnings?: string[]
}

export type ImportQueueItem = {
  file: File
  fileName: string
  status: QueueItemStatus
  result?: QuickImportResult
  error?: string
}

export type ImportQueueState = {
  total: number
  completed: number
  running: boolean
  cancelled: boolean
  currentFileName: string | null
  items: ImportQueueItem[]
}

export type RunImportQueueOptions = {
  files: File[]
  userId: string
  subjectId?: string | null
  folderId?: string | null
  signal?: AbortSignal
  delayMs?: number
  onProgress: (state: ImportQueueState) => void
}

function buildState(
  items: ImportQueueItem[],
  running: boolean,
  cancelled: boolean,
  currentFileName: string | null
): ImportQueueState {
  const completed = items.filter((i) => i.status === "done" || i.status === "error").length
  return {
    total: items.length,
    completed,
    running,
    cancelled,
    currentFileName,
    items: items.map((i) => ({ ...i })),
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true }
    )
  })
}

export async function runImportQueue(opts: RunImportQueueOptions): Promise<ImportQueueState> {
  const { files, userId, subjectId, folderId, signal, delayMs = 200, onProgress } = opts

  const items: ImportQueueItem[] = files.map((file) => ({
    file,
    fileName: file.name,
    status: "pending",
  }))

  let cancelled = false
  const emit = (running: boolean, currentFileName: string | null) => {
    onProgress(buildState(items, running, cancelled, currentFileName))
  }

  emit(true, null)

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) {
      cancelled = true
      for (let j = i; j < items.length; j++) {
        if (items[j].status === "pending") items[j].status = "cancelled"
      }
      emit(false, null)
      return buildState(items, false, cancelled, null)
    }

    const item = items[i]
    item.status = "running"
    emit(true, item.fileName)

    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("file", item.file)
    if (subjectId) fd.append("subject_id", subjectId)
    if (folderId) fd.append("folder_id", folderId)

    try {
      const res = await fetch("/api/questions/import/quick", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) {
        item.status = "error"
        item.error = data.error ?? "Falha ao importar"
      } else {
        item.status = "done"
        item.result = data as QuickImportResult
      }
    } catch (e) {
      item.status = "error"
      item.error = e instanceof Error ? e.message : "Erro de rede"
    }

    emit(true, null)

    if (i < items.length - 1) {
      await sleep(delayMs, signal)
    }
  }

  emit(false, null)
  return buildState(items, false, cancelled, null)
}
