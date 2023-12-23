export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function POST(
  request: Request // needed so we don't cache this request
) {
  const { aminoUser, error: errorUser } = await GetAminoUserOnRequest()

  if (errorUser || !aminoUser) {
    return new NextResponse(JSON.stringify({ error: "No user was authenticated", details: errorUser }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  const { foodImageId, foodItemId } = await request.json()

  if (!foodImageId) {
    return new Response("No foodImageId provided", { status: 400 })
  }
  if (!foodItemId) {
    return new Response("No foodItemId provided", { status: 400 })
  }

  const supabaseAdmin = createAdminSupabase()
  const { error, data: foodImage } = await supabaseAdmin.from("FoodImage").select().eq("id", foodImageId).single()

  if (error) {
    return new NextResponse(JSON.stringify({ error: "Food Image not found", details: error.message }), {
      status: 404,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  // Fetch the current downvotes value for the foodImageId from the FoodItemImages table
  const { data: foodItemImage, error: foodItemImageError } = await supabaseAdmin
    .from("FoodItemImages")
    .select("downvotes")
    .eq("foodImageId", foodImageId)
    .single()

  if (foodItemImageError) {
    return new NextResponse(
      JSON.stringify({ error: "Food Item Image not found", details: foodItemImageError.message }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  }

  // Update the downvotes in the FoodImages table
  const { error: updateError } = await supabaseAdmin
    .from("FoodImage")
    .update({ downvotes: foodImage.downvotes + 1 })
    .eq("foodImage", foodImage.id)
    .select()
    .single()

  if (updateError) {
    return new NextResponse(JSON.stringify({ error: "Error down-voting image", details: updateError.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  // await forceGenerateNewFoodIconQueue.enqueue(foodItemId.toString())
  await supabaseAdmin.from("IconQueue").insert({ requested_food_string: foodImage.imageDescription || "" }).select()

  return new NextResponse(JSON.stringify({ message: "Success" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  })
}
