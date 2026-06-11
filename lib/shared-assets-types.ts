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

export type DbAsset = {
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

export type DbLink = {
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
