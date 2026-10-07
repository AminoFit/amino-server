import { NextRequest } from "next/server"
import { z } from "zod"
import { hideShared } from "@/people/sharing"
import { idParam, parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { lineageId: string } }

/** "Remove from my foods" (hidden: true) or bring a shared food back. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return userFoodRequest(async userId => {
    const { hidden } = await parseBody(request, z.object({ hidden: z.boolean() }).strict())
    return hideShared(userId, idParam(params.lineageId), hidden)
  })
}
