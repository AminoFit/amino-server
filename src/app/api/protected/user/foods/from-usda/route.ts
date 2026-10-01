import { NextRequest } from "next/server"
import { z } from "zod"
import { foodFromUsda } from "@/foodSearch/usda"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

const body = z.object({ fdcId: z.number().int().positive() }).strict()

/** Picking a USDA result: the catalogue food for it (existing or newly created), to log or add to a recipe. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async userId => foodFromUsda(userId, (await parseBody(request, body)).fdcId))
}
