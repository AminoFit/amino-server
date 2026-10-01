import { NextRequest } from "next/server"
import { z } from "zod"
import { logFoodAsMeal, quantityInput } from "@/userFoods/userFoods"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

const body = z.object({ quantity: quantityInput, consumedOn: z.string().datetime({ offset: true }),
  localId: z.string().uuid() }).strict()

/** Logs a food (e.g. 1.5 portions of a recipe) as a new meal. Retrying with the same localId returns that meal. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return logFoodAsMeal(userId, idParam(params.id), input.quantity, input.consumedOn, input.localId)
  })
}
