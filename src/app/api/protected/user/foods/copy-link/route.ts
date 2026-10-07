import { NextRequest } from "next/server"
import { z } from "zod"
import { copyLinkPreview } from "@/people/sharing"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** What a copy link offers. A POST, so the token stays out of URLs and logs. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => {
    const { token } = await parseBody(request, z.object({ token: z.string().min(16).max(80) }).strict())
    return copyLinkPreview(userId, token)
  })
}
