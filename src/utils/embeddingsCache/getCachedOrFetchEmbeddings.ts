import { vectorToSql } from "@/utils/pgvectorHelper"
import { createAdminSupabase } from "../supabase/serverAdmin"

// BGE base (768-d) is the only embedding in use: FoodItem, USDA and the cache
// all store `bgeBaseEmbedding`. Cloudflare first, Deep Infra as a fallback.
const MODEL = "BAAI/bge-base-en-v1.5"

const parseVector = (value?: string | null): number[] =>
  !value || value === "[]" ? [] : value.replace(/[\[\]]/g, "").split(",").map(Number)

export async function getCfEmbedding(input: string | string[]): Promise<number[][]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`,
    { method: "POST", headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: Array.isArray(input) ? input : [input] }) })
  if (!response.ok) throw new Error(`Cloudflare AI API error: ${response.status}`)
  const result = await response.json()
  if (!result.success || !Array.isArray(result.result?.data)) throw new Error("Unexpected Cloudflare AI API response format.")
  return result.result.data
}

async function getDiEmbedding(input: string[]): Promise<number[][]> {
  const response = await fetch(`https://api.deepinfra.com/v1/inference/${MODEL}`, {
    method: "POST", headers: { Authorization: `bearer ${process.env.DEEP_INFRA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: input }) })
  if (!response.ok) throw new Error(`Deep Infra API error: ${response.status}`)
  const result = await response.json()
  if (!Array.isArray(result.embeddings)) throw new Error("Unexpected Deep Infra API response format.")
  return result.embeddings
}

export async function getCachedOrFetchEmbeddings(
  _modelType: "BGE_BASE",
  searchItems: string[]
): Promise<{ id: number; embedding: number[]; text: string }[]> {
  const supabase = createAdminSupabase()
  const unique = [...new Set(searchItems)]
  const { data } = await supabase.from("foodEmbeddingCache").select("id,textToEmbed,bgeBaseEmbedding")
    .in("textToEmbed", unique).not("bgeBaseEmbedding", "is", null)
  const found = new Map((data ?? []).map(row => [row.textToEmbed, { id: row.id, embedding: parseVector(row.bgeBaseEmbedding) }]))
  const missing = unique.filter(text => !found.has(text))
  if (missing.length) {
    let vectors: number[][]
    try { vectors = await getCfEmbedding(missing) }
    catch (error) { console.error("Cloudflare embedding failed, using Deep Infra", error); vectors = await getDiEmbedding(missing) }
    for (const [index, text] of missing.entries()) {
      const { data: row, error } = await supabase.from("foodEmbeddingCache")
        .upsert({ textToEmbed: text, bgeBaseEmbedding: vectorToSql(vectors[index]) }, { onConflict: "textToEmbed" })
        .select("id").single()
      if (row) found.set(text, { id: row.id, embedding: vectors[index] })
      else console.error("Failed to cache embedding", error)
    }
  }
  return searchItems.map(text => ({ id: found.get(text)?.id ?? -1, embedding: found.get(text)?.embedding ?? [], text }))
}
