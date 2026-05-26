/** Upload de PDFs do Coach — Vercel (4 MB) ou VPS upload-supabase (20 MB). */

export function getCoachUploadBaseUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_COACH_UPLOAD_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

export function usesExternalCoachUpload(): boolean {
  return Boolean(getCoachUploadBaseUrl())
}

export function getCoachUploadMaxBytes(): number {
  return usesExternalCoachUpload() ? 20 * 1024 * 1024 : 4 * 1024 * 1024
}

export function getCoachUploadMaxLabel(): string {
  return usesExternalCoachUpload() ? "20 MB" : "4 MB"
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

/** Envia PDFs de material de estudo (study_material). */
export async function uploadCoachStudyMaterials(params: {
  files: File[]
  userId: string
  subjectId: string
}): Promise<CoachUploadResult> {
  const { files, userId, subjectId } = params
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

  if (external) {
    const token = await getAccessToken()
    if (!token) {
      return {
        okCount: 0,
        errors: ["Faça login de novo para enviar arquivos."],
        documentIds: [],
      }
    }

    const form = new FormData()
    form.append("doc_type", "study_material")
    form.append("subject_id", subjectId)
    for (const f of validFiles) {
      form.append("files", f)
    }

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
      errors.push(
        (data as { error?: string }).error ??
          `Erro no servidor de upload (${res.status})`
      )
      return { okCount: 0, errors, documentIds }
    }

    const payload = data as {
      uploaded?: { id: string }[]
      document_ids?: string[]
      errors?: { file: string; error: string }[]
    }
    if (payload.errors?.length) {
      for (const e of payload.errors) {
        errors.push(`${e.file}: ${e.error}`)
      }
    }
    okCount = payload.uploaded?.length ?? 0
    if (payload.document_ids?.length) {
      documentIds.push(...payload.document_ids)
    }
    return { okCount, errors, documentIds }
  }

  for (const file of validFiles) {
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
      errors.push(
        `${file.name}: ${(data as { error?: string }).error ?? (res.status === 413 ? `arquivo grande demais (máx. ${maxLabel})` : "erro no upload")}`
      )
      continue
    }
    const payload = data as {
      errors?: { file: string; error: string }[]
      document_ids?: string[]
    }
    if (payload.errors?.length) {
      for (const e of payload.errors) {
        errors.push(`${e.file}: ${e.error}`)
      }
    }
    if (payload.document_ids?.length) {
      documentIds.push(...payload.document_ids)
    }
    okCount++
  }

  return { okCount, errors, documentIds }
}
