import { NextRequest } from "next/server"
import { z } from "zod"
import { mealsLoggedFor } from "@/people/people"
import { userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** Meals the user logged for this person, while they may still log for them. */
export async function GET(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => mealsLoggedFor(userId, z.string().uuid().parse(params.id)))
}
