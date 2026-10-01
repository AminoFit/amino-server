import { NextRequest } from "next/server"
import { archiveUserFood, getUserFood, saveUserFood, userFoodBody } from "@/userFoods/userFoods"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** A food the user can see, with servings, nutrients and (for a recipe) ingredients. Archived versions too. */
export async function GET(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => getUserFood(userId, idParam(params.id)))
}

/** Edits the user's own food or recipe. With past logs this saves a new version (the result's foodId). */
export async function PUT(request: NextRequest, { params }: Params) {
  return userFoodRequest(async userId =>
    saveUserFood(userId, idParam(params.id), await parseBody(request, userFoodBody)))
}

/** Deletes (archives) the user's own food or recipe. Past logs keep showing it. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return userFoodRequest(async userId => {
    await archiveUserFood(userId, idParam(params.id))
    return { archived: true }
  })
}
