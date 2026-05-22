import { NextResponse } from "next/server"
import {
  fetchBankQuestions,
  fetchFilterFacets,
  parseBankFiltersFromSearchParams,
  applyMappingFilter,
} from "@/lib/question-bank"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  let filters = parseBankFiltersFromSearchParams(searchParams)

  if (user_id && (filters.subject_id || filters.topic_id)) {
    filters = await applyMappingFilter(user_id, filters)
  }

  const facetsOnly = searchParams.get("facets") === "1"
  if (facetsOnly) {
    const facets = await fetchFilterFacets()
    return NextResponse.json(facets)
  }

  const limit = parseInt(searchParams.get("limit") ?? "50", 10)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)

  try {
    const { questions, total } = await fetchBankQuestions(filters, { limit, offset })
    return NextResponse.json({ questions, total, filters })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
