import { NextRequest } from "next/server"
import { z } from "zod"
import { recipeDraftFromMeal } from "@/userFoods/userFoods"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

// portions and loggedAmountsAre came from the first app build; they are accepted and ignored.
const body = z.object({ messageId: z.number().int().positive(), portions: z.number().optional(),
  loggedAmountsAre: z.string().optional() }).strict()

/** "Add as recipe" on a meal: a draft of its foods and amounts for the recipe editor. Nothing is saved. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return recipeDraftFromMeal(userId, input.messageId)
  })
}
