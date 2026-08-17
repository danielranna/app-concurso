import { supabase } from "@/lib/supabase"

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function tutorialsFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAccessToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  return fetch(input, { ...init, headers })
}

export function uploadToSignedUrl(
  signedUrl: string,
  file: Blob,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.setRequestHeader("x-upsert", "true")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload falhou (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Falha de rede no upload"))
    xhr.onabort = () => reject(new Error("Upload cancelado"))
    xhr.send(file)
  })
}

export function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    const objectUrl = URL.createObjectURL(file)

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute("src")
      video.load()
    }

    const fail = () => {
      cleanup()
      resolve(null)
    }

    video.onerror = fail
    video.onloadeddata = () => {
      const t = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(1, video.duration * 0.1)
        : 0
      try {
        video.currentTime = t
      } catch {
        fail()
      }
    }
    video.onseeked = () => {
      try {
        const maxW = 640
        const w = video.videoWidth || 640
        const h = video.videoHeight || 360
        const scale = w > maxW ? maxW / w : 1
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          fail()
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            cleanup()
            resolve(blob)
          },
          "image/jpeg",
          0.8
        )
      } catch {
        fail()
      }
    }
    video.src = objectUrl
  })
}
