import OpenAI from "openai"

import * as path from "path"
require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env.local")
})


export const openai = new OpenAI({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY
})

export async function getAdaEmbedding(input: string[]): Promise<OpenAI.CreateEmbeddingResponse> {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: input
  })
  return embedding
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  // can use dot product due to embeddings being normalized
  // dot product cosine similarity is not possible on unnormalized embeddings
  let dotProduct = 0.0
  let normA = 0.0
  let normB = 0.0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += Math.pow(vecA[i], 2)
    normB += Math.pow(vecB[i], 2)
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function euclideanDistance(vecA: number[], vecB: number[]): number {
  let sum = 0
  for (let i = 0; i < vecA.length; i++) {
    sum += Math.pow(vecA[i] - vecB[i], 2)
  }
  return Math.sqrt(sum)
}
