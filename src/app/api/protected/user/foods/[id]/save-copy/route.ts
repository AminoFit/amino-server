import { NextRequest } from "next/server"
import { saveCopy } from "@/people/sharing"
import { idParam, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** "Save a copy" of a food shared with the user: theirs to edit. */
export async function POST(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => saveCopy(userId, idParam(params.id)), 201)
}
