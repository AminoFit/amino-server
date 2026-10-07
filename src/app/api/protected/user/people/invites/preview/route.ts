import { NextRequest } from "next/server"
import { inviteRef, previewInvite } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Who invited the user and what they ask. A POST, so the token stays out of URLs and logs. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => previewInvite(userId, await parseBody(request, inviteRef)))
}
