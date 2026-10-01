export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { searchFoodsForUser } from "@/foodSearch/searchFoods"

// The app's food search (add to log, a recipe's foods, swapping a logged food). Results are the user's own recipes and
// foods first, then the catalogue, each with its source; older app builds read the same flat `results` list.
const body = z.object({ foodLogString: z.string().trim().min(1).max(100), mode: z.enum(["log", "ingredient"]).optional(),
  cursor: z.number().int().min(0).max(500).optional() })

export async function POST(request: Request) {
  const { userId } = await GetUserIdOnRequest()
  if (!userId) return NextResponse.json({ error: "No user was authenticated" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "No foodLogString provided" }, { status: 400 })
  try {
    const { results, nextCursor } = await searchFoodsForUser(userId, parsed.data.foodLogString,
      { mode: parsed.data.mode, cursor: parsed.data.cursor })
    return NextResponse.json({ results, nextCursor })
  } catch (error) {
    console.error("food_search_failed", error)
    return NextResponse.json({ error: "Error searching Database" }, { status: 500 })
  }
}
