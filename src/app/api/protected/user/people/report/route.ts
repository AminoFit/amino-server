import { NextRequest } from "next/server"
import { report, reportInput } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Reports a person (by id) or the inviter behind an invite, with an optional reason. Stored for review only. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => report(userId, await parseBody(request, reportInput)))
}
