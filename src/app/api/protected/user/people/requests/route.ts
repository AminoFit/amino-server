import { NextRequest } from "next/server"
import { emailRequestInput, requestByEmail } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** A request by email. The answer is the same whether or not the email has an account. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => requestByEmail(userId, await parseBody(request, emailRequestInput)))
}
