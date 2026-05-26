/** Sync com lib/ai/embeddings.ts */

const EMBEDDING_MODEL = "text-embedding-3-small"
const EMBEDDING_DIM = 1536

export async function embedTexts(texts, credentials) {
  if (credentials.provider !== "openai") {
    throw new Error("Embeddings exigem chave OpenAI")
  }

  const trimmed = texts.map((t) => t.slice(0, 8000))
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIM,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings: ${err}`)
  }

  const data = await res.json()
  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}
