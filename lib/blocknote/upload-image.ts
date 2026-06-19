import { supabase } from "@/lib/supabase"

export async function uploadNotebookImage(file: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Faça login para enviar imagens")

  const form = new FormData()
  form.append("user_id", user.id)
  form.append("file", file)

  const res = await fetch("/api/questions/upload", {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || "Falha ao enviar imagem")
  }

  const data = (await res.json()) as { url: string }
  return data.url
}
