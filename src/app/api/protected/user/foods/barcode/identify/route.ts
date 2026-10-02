import { NextRequest } from "next/server"
import { z } from "zod"
import { identifyBarcode } from "@/foodSearch/barcodeIdentity"
import { anySignal } from "@/foodResolution/barcodePages"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
export const maxDuration = 15

const body = z.object({ barcode: z.string().trim().min(6).max(20) }).strict()

/** A barcode the app's camera read, named in a second or two (the catalogue's food, or what the web calls it), while
 * the full lookup (../route.ts) reads its facts. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return identifyBarcode(userId, input.barcode, { signal: anySignal(request.signal, 8000) })
  })
}
