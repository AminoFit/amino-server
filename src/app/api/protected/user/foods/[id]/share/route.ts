import { NextRequest } from "next/server"
import { foodSharing, shareFood, shareInput } from "@/people/sharing"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** The share sheet: linked people and whether each sees this food. */
export async function GET(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => foodSharing(userId, idParam(params.id)))
}

/** Shares (or stops sharing) this food with linked people. Stopping leaves them copies of what they used. */
export async function POST(request: NextRequest, { params }: Params) {
  return userFoodRequest(async userId => {
    const input = await parseBody(request, shareInput)
    return shareFood(userId, [idParam(params.id)], input.recipientIds, input.on)
  })
}
