import { NextRequest, NextResponse } from "next/server"
import { logForInput, logFoodsFor } from "@/people/logFor"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Add Food's tray: the foods the user picked, logged as one meal for them and/or people who let them log for them
 * (forUserIds). Retrying with the same localId returns those meals. 409 when someone already has a similar meal
 * (send allowDuplicate to log anyway). */
export async function POST(request: NextRequest) {
  const response = await userFoodRequest(async userId => {
    const result = await logFoodsFor(userId, await parseBody(request, logForInput))
    // The app before people (one meal, no forUserIds) reads messageId and loggedFoodItemIds at the top level.
    return result.status === "logged" && result.meals?.length === 1 ? { ...result, ...result.meals[0] } : result
  })
  if (response.status !== 200) return response
  const body = await response.json()
  return NextResponse.json(body, { status: body.status === "possible_duplicate" ? 409 : 200 })
}
