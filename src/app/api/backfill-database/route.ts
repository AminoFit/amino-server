// src/app/api/backfill-database/route.ts
import { embeddingBackfill } from "@/database/OpenAiFunctions/utils/embeddingBackfill";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await embeddingBackfill();
    return NextResponse.json({ text: "get ok" });
  } catch (error) {
    console.error("Error in embeddingBackfill:", error);
    return NextResponse.json({ text: "get error", error: error });
  }
}
