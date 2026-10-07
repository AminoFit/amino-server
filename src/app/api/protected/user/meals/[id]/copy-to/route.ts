import { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { copyMealInput, copyMealTo } from "@/people/logFor"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** "Log for…" a past meal: the same foods and numbers into other people's diaries. 409 when one of them already has a
 * similar meal (send allowDuplicate to log anyway). */
export async function POST(request: NextRequest, { params }: Params) {
  const response = await userFoodRequest(async userId => copyMealTo(userId, idParam(params.id), await parseBody(request, copyMealInput)))
  return withDuplicateStatus(response)
}

async function withDuplicateStatus(response: Response) {
  if (response.status !== 200) return response
  const body = await response.json()
  return NextResponse.json(body, { status: body.status === "possible_duplicate" ? 409 : 200 })
}
