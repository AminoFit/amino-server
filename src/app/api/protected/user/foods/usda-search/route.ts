import { NextRequest } from "next/server"
import { z } from "zod"
import { searchUsda } from "@/foodSearch/usda"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

const body = z.object({ query: z.string().trim().min(2).max(100) }).strict()

/** "More from USDA" in the app's search: USDA records the catalogue doesn't hold yet. */
export async function POST(request: NextRequest) {
  return userFoodRequest(async () => ({ foods: await searchUsda((await parseBody(request, body)).query) }))
}
