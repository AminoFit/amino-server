export const dynamic = "force-dynamic"
import { createRouteHandlerClient, createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import moment from "moment-timezone"
import { NextResponse } from "next/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"

function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, (_, value) => (typeof value === "bigint" ? value.toString() : value))
}

export async function GET(
  _request: Request, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  console.log("Entry: Get Foods on date")

  const { aminoUser, error } = await GetAminoUserOnRequest()

  if (error) {
    return new Response(error, { status: 400 })
  }

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

  console.log("datestring toISOString", parsedDate.startOf("day").toDate().toISOString())
  console.log('parsedDate.startOf("day").toDate().toISOString()', parsedDate.startOf("day").toDate().toISOString())
  console.log('parsedDate.startOf("day").endOf().toISOString()', parsedDate.endOf("day").toDate().toISOString())

  const supabase = createAdminSupabase()
  const { data: foods, error: getFoodError } = await supabase
    .from("LoggedFoodItem")
    .select("*, FoodItem(*, Serving(*), FoodImage(*))")
    .eq("userId", aminoUser.id)
    .gte("consumedOn", parsedDate.startOf("day").toDate().toISOString())
    .lte("consumedOn", parsedDate.endOf("day").toDate().toISOString())

  if (!foods) {
    console.log("Error getting foods", getFoodError)
    return new Response(getFoodError.message, { status: 500 })
  }

  const safeFoodsString = stringifyWithBigInt(foods)
  return NextResponse.json(JSON.parse(safeFoodsString))
}
