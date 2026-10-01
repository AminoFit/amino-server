import { NextRequest } from "next/server"
import { saveUserFood, userFoodBody } from "@/userFoods/userFoods"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Creates one of the user's own foods or recipes. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => saveUserFood(userId, null, await parseBody(request, userFoodBody)), 201)
}
