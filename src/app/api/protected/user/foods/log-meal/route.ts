import { NextRequest } from "next/server"
import { z } from "zod"
import { logFoodsAsMeal, quantityInput } from "@/userFoods/userFoods"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

const body = z.object({
  items: z.array(z.object({ foodItemId: z.number().int().positive(), quantity: quantityInput }).strict()).min(1).max(50),
  consumedOn: z.string().datetime({ offset: true }),
  localId: z.string().uuid()
}).strict()

/** Add Food's tray: the foods the user picked, logged as one meal. Retrying with the same localId returns that meal. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return logFoodsAsMeal(userId, input.items, input.consumedOn, input.localId)
  })
}
