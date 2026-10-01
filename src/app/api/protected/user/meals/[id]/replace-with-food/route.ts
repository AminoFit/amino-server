import { NextRequest } from "next/server"
import { z } from "zod"
import { quantityInput, replaceMealWithFood } from "@/userFoods/userFoods"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

const body = z.object({ expectedItemIds: z.array(z.number().int().positive()).min(1).max(50),
  foodId: z.number().int().positive(), quantity: quantityInput }).strict()

/** Replaces a meal's foods with one food, e.g. after "Add as recipe": "change this meal to 1 portion". The meal must
 * still have exactly the foods the user saw (expectedItemIds). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, body)
    return replaceMealWithFood(userId, idParam(params.id), input.expectedItemIds, input.foodId, input.quantity)
  })
}
