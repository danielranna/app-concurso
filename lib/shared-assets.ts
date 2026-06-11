import { supabaseServer } from "./supabase-server"

export type SharedAssetKind = "text" | "image"

export type SharedAsset = {
  id: string
  kind: SharedAssetKind
  title?: string | null
  label: string
  content: string
  widthPct?: number | null
  createdAt?: string
  updatedAt?: string
  questionCount?: number
}

export type QuestionAssetLink = {
  assetId: string
  sortOrder: number
  contentOverride?: string | null
}

export type QuestionAssetLinkWithAsset = QuestionAssetLink & {
  asset: SharedAsset
}

export type ResolvedSharedBlock = {
  id: string
  kind: SharedAssetKind
  content: string
  title?: string | null
  widthPct?: number
  isPersonalized: boolean
  assetId: string
  label: string
}

type DbAsset = {
  id: string
  user_id: string
  kind: string
  title: string | null
  label: string
  content: string
  width_pct: number | null
  created_at?: string
  updated_at?: string
}

type DbLink = {
  user_id: string
  question_id: string
  asset_id: string
  sort_order: number
  content_override: string | null
  user_shared_assets?: DbAsset | DbAsset[] | null
}

export function mapDbAsset(row: DbAsset, questionCount?: number): SharedAsset {
  return {
    id: row.id,
    kind: row.kind === "image" ? "image" : "text",
    title: row.title,
    label: row.label ?? "",
    content: row.content,
    widthPct: row.width_pct ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questionCount,
  }
}

export function resolveSharedBlocksFromLinks(
  links: QuestionAssetLinkWithAsset[]
): ResolvedSharedBlock[] {
  return [...links]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((link) => {
      const override = link.contentOverride?.trim()
      const base = link.asset.content.trim()
      const content = override || base
      return {
        id: `shared-${link.assetId}`,
        assetId: link.assetId,
        kind: link.asset.kind,
        content,
        title: link.asset.title,
        widthPct: link.asset.widthPct ?? undefined,
        isPersonalized: Boolean(override),
        label: link.asset.label,
      }
    })
    .filter((b) => b.content)
}

export async function loadSharedBlocksForQuestion(
  questionId: string,
  userId: string
): Promise<ResolvedSharedBlock[]> {
  const links = await loadQuestionAssetLinks(questionId, userId)
  return resolveSharedBlocksFromLinks(links)
}

export async function loadQuestionAssetLinks(
  questionId: string,
  userId: string
): Promise<QuestionAssetLinkWithAsset[]> {
  const { data, error } = await supabaseServer
    .from("user_question_asset_links")
    .select(
      `
      asset_id,
      sort_order,
      content_override,
      user_shared_assets (
        id,
        user_id,
        kind,
        title,
        label,
        content,
        width_pct,
        created_at,
        updated_at
      )
    `
    )
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .order("sort_order")

  if (error) throw new Error(error.message)

  const result: QuestionAssetLinkWithAsset[] = []
  for (const row of (data ?? []) as DbLink[]) {
    const raw = row.user_shared_assets
    const assetRow = Array.isArray(raw) ? raw[0] : raw
    if (!assetRow) continue
    result.push({
      assetId: row.asset_id,
      sortOrder: row.sort_order ?? 0,
      contentOverride: row.content_override,
      asset: mapDbAsset(assetRow),
    })
  }
  return result
}

export async function listUserSharedAssets(userId: string): Promise<SharedAsset[]> {
  const { data: assets, error } = await supabaseServer
    .from("user_shared_assets")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) throw new Error(error.message)

  const { data: linkCounts, error: countErr } = await supabaseServer
    .from("user_question_asset_links")
    .select("asset_id")
    .eq("user_id", userId)

  if (countErr) throw new Error(countErr.message)

  const counts = new Map<string, number>()
  for (const l of linkCounts ?? []) {
    counts.set(l.asset_id, (counts.get(l.asset_id) ?? 0) + 1)
  }

  return (assets ?? []).map((a) => mapDbAsset(a as DbAsset, counts.get(a.id) ?? 0))
}

export async function getSharedAsset(
  assetId: string,
  userId: string
): Promise<SharedAsset | null> {
  const { data, error } = await supabaseServer
    .from("user_shared_assets")
    .select("*")
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { count } = await supabaseServer
    .from("user_question_asset_links")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("asset_id", assetId)

  return mapDbAsset(data as DbAsset, count ?? 0)
}

export async function saveQuestionAssetLinks(
  questionId: string,
  userId: string,
  links: QuestionAssetLink[]
): Promise<void> {
  const { data: existing, error: exErr } = await supabaseServer
    .from("user_question_asset_links")
    .select("asset_id")
    .eq("user_id", userId)
    .eq("question_id", questionId)

  if (exErr) throw new Error(exErr.message)

  const nextIds = new Set(links.map((l) => l.assetId))
  const toDelete = (existing ?? [])
    .map((r) => r.asset_id)
    .filter((id) => !nextIds.has(id))

  if (toDelete.length) {
    const { error } = await supabaseServer
      .from("user_question_asset_links")
      .delete()
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .in("asset_id", toDelete)
    if (error) throw new Error(error.message)
  }

  if (links.length === 0) return

  const rows = links.map((l) => ({
    user_id: userId,
    question_id: questionId,
    asset_id: l.assetId,
    sort_order: l.sortOrder,
    content_override: l.contentOverride ?? null,
  }))

  const { error } = await supabaseServer.from("user_question_asset_links").upsert(rows)
  if (error) throw new Error(error.message)
}

export async function bulkLinkAssetToQuestions(
  assetId: string,
  userId: string,
  questionIds: string[]
): Promise<number> {
  if (!questionIds.length) return 0

  const { data: asset, error: aErr } = await supabaseServer
    .from("user_shared_assets")
    .select("id")
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle()

  if (aErr) throw new Error(aErr.message)
  if (!asset) throw new Error("Conteúdo não encontrado")

  const rows = questionIds.map((questionId, i) => ({
    user_id: userId,
    question_id: questionId,
    asset_id: assetId,
    sort_order: i,
    content_override: null,
  }))

  const { error } = await supabaseServer
    .from("user_question_asset_links")
    .upsert(rows, { onConflict: "user_id,question_id,asset_id", ignoreDuplicates: false })

  if (error) throw new Error(error.message)
  return questionIds.length
}
