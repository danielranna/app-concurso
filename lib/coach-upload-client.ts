/** Upload de PDFs do Coach — Vercel (~4 MB) ou VPS upload-supabase (configurável). */

export function getCoachUploadBaseUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_COACH_UPLOAD_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

export function usesExternalCoachUpload(): boolean {
  return Boolean(getCoachUploadBaseUrl())
}

function parseMaxMbEnv(): number | null {
  const raw = process.env.NEXT_PUBLIC_COACH_UPLOAD_MAX_MB?.trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Limite por PDF no navegador (deve bater com MAX_UPLOAD_BYTES na VPS). */
export function getCoachUploadMaxBytes(): number {
  const fromEnv = parseMaxMbEnv()
  if (fromEnv) return Math.round(fromEnv * 1024 * 1024)
  return usesExternalCoachUpload() ? 50 * 1024 * 1024 : 4 * 1024 * 1024
}

export function getCoachUploadMaxLabel(): string {
  const mb = Math.round(getCoachUploadMaxBytes() / (1024 * 1024))
  return `${mb} MB`
}

export type CoachUploadProgress = {
  current: number
  total: number
  fileName: string
  phase: "uploading" | "done"
}

export type CoachUploadResult = {
  okCount: number
  errors: string[]
  documentIds: string[]
}

async function getAccessToken(): Promise<string | null> {
  const { supabase } = await import("@/lib/supabase")
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function uploadOneStudyMaterial(params: {
  file: File
  userId: string
  subjectId: string
  external: string | null
  maxLabel: string
}): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const { file, userId, subjectId, external, maxLabel } = params

  if (external) {
    const token = await getAccessToken()
    if (!token) {
      return { ok: false, error: "Faça login de novo para enviar arquivos." }
    }

    const form = new FormData()
    form.append("doc_type", "study_material")
    form.append("subject_id", subjectId)
    form.append("files", file)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }
    const secret = process.env.NEXT_PUBLIC_COACH_UPLOAD_SECRET?.trim()
    if (secret) headers["X-Coach-Upload-Secret"] = secret

    const res = await fetch(`${external}/coach/documents/upload`, {
      method: "POST",
      headers,
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data as { error?: string }).error ??
          `Erro no servidor de upload (${res.status})`,
      }
    }

    const payload = data as {
      uploaded?: { id: string }[]
      document_ids?: string[]
      errors?: { file: string; error: string }[]
    }
    if (payload.errors?.length) {
      const e = payload.errors[0]
      return { ok: false, error: e ? `${e.file}: ${e.error}` : "Falha no upload" }
    }
    const docId = payload.document_ids?.[0] ?? payload.uploaded?.[0]?.id
    return docId ? { ok: true, documentId: docId } : { ok: true }
  }

  const form = new FormData()
  form.append("user_id", userId)
  form.append("subject_id", subjectId)
  form.append("doc_type", "study_material")
  form.append("file", file)

  const res = await fetch("/api/coach/documents/upload", {
    method: "POST",
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error:
        (data as { error?: string }).error ??
        (res.status === 413
          ? `arquivo grande demais (máx. ${maxLabel})`
          : "erro no upload"),
    }
  }
  const payload = data as {
    errors?: { file: string; error: string }[]
    document_ids?: string[]
  }
  if (payload.errors?.length) {
    const e = payload.errors[0]
    return { ok: false, error: e ? `${e.file}: ${e.error}` : "Falha no upload" }
  }
  const docId = payload.document_ids?.[0]
  return docId ? { ok: true, documentId: docId } : { ok: true }
}

/** Envia PDFs de material de estudo (study_material), um por vez, com progresso. */
export async function uploadCoachStudyMaterials(params: {
  files: File[]
  userId: string
  subjectId: string
  onProgress?: (progress: CoachUploadProgress) => void
}): Promise<CoachUploadResult> {
  const { files, userId, subjectId, onProgress } = params
  const errors: string[] = []
  const documentIds: string[] = []
  let okCount = 0
  const maxBytes = getCoachUploadMaxBytes()
  const maxLabel = getCoachUploadMaxLabel()
  const external = getCoachUploadBaseUrl()

  const validFiles = files.filter((f) => {
    if (f.size > maxBytes) {
      errors.push(`${f.name}: maior que ${maxLabel}.`)
      return false
    }
    return true
  })

  if (!validFiles.length) {
    return { okCount: 0, errors, documentIds }
  }

  const total = validFiles.length

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i]!
    onProgress?.({
      current: i,
      total,
      fileName: file.name,
      phase: "uploading",
    })

    const result = await uploadOneStudyMaterial({
      file,
      userId,
      subjectId,
      external,
      maxLabel,
    })

    if (result.ok) {
      okCount++
      if (result.documentId) documentIds.push(result.documentId)
    } else {
      errors.push(`${file.name}: ${result.error ?? "erro no upload"}`)
    }

    onProgress?.({
      current: i + 1,
      total,
      fileName: file.name,
      phase: "done",
    })
  }

  return { okCount, errors, documentIds }
}
