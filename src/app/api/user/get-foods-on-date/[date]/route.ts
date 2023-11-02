export const dynamic = "force-dynamic"
import { createRouteHandlerClient, createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import moment from "moment-timezone"
import { NextResponse } from "next/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, (_, value) => (typeof value === "bigint" ? value.toString() : value))
}

export async function GET(
  _request: Request, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  console.log("Entry: Get Foods on date")
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    console.log("No authenticated user")
    return new Response("No authenticated user", { status: 404 })
  }

  const { error, data: aminoUser } = await supabase.from("User").select().eq("id", user.id).single()

  const dateString = params.date
  if (!aminoUser) {
    console.log("No amino user for authenticated user")
    return new Response("No amino user for authenticated user", { status: 400 })
  }

  if (!dateString) {
    console.log("No date provided")
    return new Response("No date provided", { status: 400 })
  }

  const parsedDate = moment.tz(dateString, "YYYY-MM-DD", aminoUser.tzIdentifier)

  if (!parsedDate.isValid()) {
    console.log("Provided date is invalid. Must be in YYYY-MM-DD format")
    return new Response("Provided date is invalid. Must be in YYYY-MM-DD format", { status: 400 })
  }

  console.log("datestring", parsedDate.startOf("day").toDate().toISOString())

  const { data: foods, error: getFoodError } = await supabase
    .from("LoggedFoodItem")
    .select("*, FoodItem(*, Serving(*), FoodImage(*))")
    .eq("userId", user.id)
    .gte("consumedOn", parsedDate.startOf("day").toDate().toISOString())
    .lte("consumedOn", parsedDate.endOf("day").toDate().toUTCString())

  if (!foods) {
    console.log("Error getting foods", getFoodError)
    return new Response(getFoodError.message, { status: 500 })
  }

  const safeFoodsString = stringifyWithBigInt(foods)
  return NextResponse.json(JSON.parse(safeFoodsString))
}
