import { embeddingBackfill } from "@/database/OpenAiFunctions/utils/embeddingBackfill"

import { NextResponse } from "next/server"

export async function GET() {

  await embeddingBackfill()

  return NextResponse.json({
    text: "get ok",
  })
}
