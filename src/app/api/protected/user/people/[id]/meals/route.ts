import { NextRequest } from "next/server"
import { z } from "zod"
import { mealsLoggedFor } from "@/people/people"
import { userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** Meals the user logged for this person, newest first, a page at a time (?before=&beforeId= from the last page's `next`). */
export async function GET(request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => mealsLoggedFor(userId, z.string().uuid().parse(params.id),
    Object.fromEntries(request.nextUrl.searchParams)))
}
