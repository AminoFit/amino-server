import { NextRequest } from "next/server"
import { createInvite, inviteInput } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** A QR code (15 minutes, one live at a time) or link (7 days) invite. It only asks; the invitee grants. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => createInvite(userId, await parseBody(request, inviteInput)), 201)
}
