export const TUTORIALS_BUCKET = "tutorials"

export const TUTORIAL_MAX_BYTES = 200 * 1024 * 1024
export const TUTORIAL_MAX_SIZE_LABEL = "200 MB"

export const TUTORIAL_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const

export const TUTORIAL_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"

export type TutorialStatus = "draft" | "published"

export type Tutorial = {
  id: string
  title: string
  description: string
  video_path: string
  video_url: string
  thumbnail_path: string | null
  thumbnail_url: string | null
  author_id: string
  author_email: string | null
  status: TutorialStatus
  created_at: string
  updated_at: string
}

export function isAllowedTutorialVideo(file: File): boolean {
  if (TUTORIAL_VIDEO_TYPES.includes(file.type as (typeof TUTORIAL_VIDEO_TYPES)[number])) {
    return true
  }
  const name = file.name.toLowerCase()
  return name.endsWith(".mp4") || name.endsWith(".webm") || name.endsWith(".mov")
}

export function tutorialVideoExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName === "mp4" || fromName === "webm" || fromName === "mov") return fromName
  if (file.type === "video/webm") return "webm"
  if (file.type === "video/quicktime") return "mov"
  return "mp4"
}

export function sanitizeTutorialSearch(q: string): string {
  return q.replace(/[%(),'"]/g, " ").replace(/\s+/g, " ").trim()
}

export function formatTutorialDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
