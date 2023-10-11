import { openai } from "@/utils/openaiFunctionSchemas"
import { NextResponse } from "next/server"

export async function GET() {
  console.log("Testing getting an embedding from open AI")

  const startTime = Date.now()
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: "Starbucks Iced Coffee with Classic Syrup",
  })
  const endTime = Date.now()
  return NextResponse.json({
    text: "get ok",
    requestTime: endTime - startTime,
    embedding: embedding.data
  })
}
