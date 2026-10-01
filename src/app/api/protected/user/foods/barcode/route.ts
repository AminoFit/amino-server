import { NextRequest } from "next/server"
import { z } from "zod"
import { foodForBarcode } from "@/foodSearch/barcodeLookup"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const body = z.object({ barcode: z.string().trim().min(6).max(20) }).strict()

/** A barcode the app's camera read: its food (found or added from USDA / Open Food Facts), or unknown. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return foodForBarcode(userId, input.barcode, { signal: request.signal })
  })
}
