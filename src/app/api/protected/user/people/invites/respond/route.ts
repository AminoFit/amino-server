import { NextRequest } from "next/server"
import { respondInput, respondToInvite } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Accept (with the user's own grants), decline, or decline and block. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => respondToInvite(userId, await parseBody(request, respondInput)))
}
