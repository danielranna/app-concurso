import { redirect } from "next/navigation"

export default function FlashcardsSettingsRedirect() {
  redirect("/configuracoes?tab=flashcards")
}
