import { NextRequest } from "next/server"
import { z } from "zod"
import { copyFromLink } from "@/people/sharing"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Adds the user's own copy (or returns the copy they already have, unless again). */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const { token, again } = await parseBody(request, z.object({ token: z.string().min(16).max(80), again: z.boolean().default(false) }).strict())
    return copyFromLink(userId, token, again)
  })
}
