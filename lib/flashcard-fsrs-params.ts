import type { FSRSParameters } from "ts-fsrs"
import { supabaseServer } from "./supabase-server"
import { mergeFsrsParams } from "./fsrs-params-merge"
import type { UserFsrsSettings } from "./flashcard-types"

export { clampRetention, mergeFsrsParams, RETENTION_MAX, RETENTION_MIN } from "./fsrs-params-merge"

export async function getUserFsrsSettings(userId: string): Promise<UserFsrsSettings> {
  const { data } = await supabaseServer
    .from("flashcard_schedule_settings")
    .select("fsrs_parameters")
    .eq("user_id", userId)
    .maybeSingle()

  return (data?.fsrs_parameters as UserFsrsSettings) ?? {}
}

export async function getDeckFsrsSettings(deckId: string): Promise<UserFsrsSettings> {
  const { data } = await supabaseServer
    .from("flashcard_decks")
    .select("fsrs_parameters")
    .eq("id", deckId)
    .maybeSingle()

  return (data?.fsrs_parameters as UserFsrsSettings) ?? {}
}

export async function resolveFsrsParams(
  userId: string,
  deckId?: string | null
): Promise<Partial<FSRSParameters>> {
  const userSettings = await getUserFsrsSettings(userId)
  if (!deckId) return mergeFsrsParams(userSettings)
  const deckSettings = await getDeckFsrsSettings(deckId)
  return mergeFsrsParams(userSettings, deckSettings)
}
