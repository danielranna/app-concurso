"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  TUTORIAL_MAX_BYTES,
  TUTORIAL_MAX_SIZE_LABEL,
  TUTORIAL_VIDEO_ACCEPT,
  isAllowedTutorialVideo,
  tutorialVideoExtension,
  type Tutorial,
} from "@/lib/tutorials"
import {
  captureVideoThumbnail,
  tutorialsFetch,
  uploadToSignedUrl,
} from "@/lib/tutorials-client"

type Props = {
  mode: "create" | "edit"
  initial?: Tutorial
}

export default function TutorialForm({ mode, initial }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.video_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function setLocalPreview(next: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (next) {
      const url = URL.createObjectURL(next)
      previewUrlRef.current = url
      setPreviewUrl(url)
    } else {
      setPreviewUrl(initial?.video_url ?? null)
    }
  }

  function onFileChange(next: File | null) {
    setError(null)
    if (!next) {
      setFile(null)
      setLocalPreview(null)
      return
    }
    if (!isAllowedTutorialVideo(next)) {
      setError("Formato inválido. Envie um vídeo MP4, WebM ou MOV.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    if (next.size > TUTORIAL_MAX_BYTES) {
      setError(`O vídeo deve ter no máximo ${TUTORIAL_MAX_SIZE_LABEL}.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setFile(next)
    setLocalPreview(next)
  }

  async function requestUploadUrl(kind: "video" | "thumbnail", filename: string, contentType: string) {
    const res = await tutorialsFetch("/api/tutorials/upload-url", {
      method: "POST",
      body: JSON.stringify({ kind, filename, contentType }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error ?? "Não foi possível iniciar o upload")
    }
    return data as { signedUrl: string; path: string; publicUrl: string }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle) {
      setError("Informe o título do tutorial.")
      return
    }
    if (!trimmedDescription) {
      setError("Informe a descrição do tutorial.")
      return
    }
    if (mode === "create" && !file) {
      setError("Selecione um vídeo para publicar.")
      return
    }

    setSubmitting(true)
    setError(null)
    setProgress(0)

    try {
      let video_path = initial?.video_path
      let video_url = initial?.video_url
      let thumbnail_path = initial?.thumbnail_path ?? null
      let thumbnail_url = initial?.thumbnail_url ?? null

      if (file) {
        setProgressLabel("Enviando vídeo…")
        const ext = tutorialVideoExtension(file)
        const videoUpload = await requestUploadUrl(
          "video",
          `tutorial.${ext}`,
          file.type || "video/mp4"
        )
        await uploadToSignedUrl(videoUpload.signedUrl, file, file.type || "video/mp4", (pct) => {
          setProgress(Math.round(pct * 0.85))
        })
        video_path = videoUpload.path
        video_url = videoUpload.publicUrl

        setProgress(88)
        setProgressLabel("Gerando preview…")
        const thumb = await captureVideoThumbnail(file)
        if (thumb) {
          const thumbUpload = await requestUploadUrl("thumbnail", "thumb.jpg", "image/jpeg")
          await uploadToSignedUrl(thumbUpload.signedUrl, thumb, "image/jpeg", () => {})
          thumbnail_path = thumbUpload.path
          thumbnail_url = thumbUpload.publicUrl
        } else {
          thumbnail_path = null
          thumbnail_url = null
        }
      }

      setProgress(95)
      setProgressLabel("Publicando tutorial…")

      const payload = {
        title: trimmedTitle,
        description: trimmedDescription,
        status: "published" as const,
        ...(file
          ? { video_path, video_url, thumbnail_path, thumbnail_url }
          : {}),
      }

      const res =
        mode === "create"
          ? await tutorialsFetch("/api/tutorials", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                video_path,
                video_url,
                thumbnail_path,
                thumbnail_url,
              }),
            })
          : await tutorialsFetch(`/api/tutorials/${initial!.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível salvar o tutorial")
      }

      setProgress(100)
      router.push(mode === "create" ? "/tutoriais?publicado=1" : "/tutoriais?atualizado=1")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar o tutorial")
      setSubmitting(false)
      setProgress(0)
      setProgressLabel("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="tutorial-title" className="mb-1.5 block text-sm font-medium text-slate-700">
          Título
        </label>
        <Input
          id="tutorial-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Como cadastrar um novo cliente"
          required
          disabled={submitting}
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="tutorial-description" className="mb-1.5 block text-sm font-medium text-slate-700">
          Descrição
        </label>
        <textarea
          id="tutorial-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explique brevemente o conteúdo do tutorial."
          required
          disabled={submitting}
          rows={5}
          className="flex w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm shadow-slate-200/30 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="tutorial-video" className="mb-1.5 block text-sm font-medium text-slate-700">
          Vídeo{mode === "edit" ? " (opcional — envie outro para substituir)" : ""}
        </label>
        <input
          ref={fileInputRef}
          id="tutorial-video"
          type="file"
          accept={TUTORIAL_VIDEO_ACCEPT}
          disabled={submitting}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100 disabled:opacity-50"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          MP4, WebM ou MOV · até {TUTORIAL_MAX_SIZE_LABEL}
        </p>
      </div>

      {previewUrl && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Preview</p>
          <video
            key={previewUrl}
            src={previewUrl}
            controls
            className="aspect-video w-full rounded-xl bg-black"
          />
        </div>
      )}

      {submitting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{progressLabel || "Enviando…"}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Publicando…" : "Publicar tutorial"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={submitting}
          onClick={() => router.push("/tutoriais")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
