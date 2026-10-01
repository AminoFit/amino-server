import { NextRequest } from "next/server"
import { z } from "zod"
import { labelDraft } from "@/userFoods/labelDraft"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const body = z.object({ imagePath: z.string().min(3).max(400) }).strict()

/** "Scan label" in the food editor: a draft of the label's values (and any barcode) from an uploaded photo. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => labelDraft(userId, (await parseBody(request, body)).imagePath))
}
