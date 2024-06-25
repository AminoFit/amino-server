// src/app/api/protected/user/update-logged-food-item-serving/route.ts
import { NextRequest, NextResponse } from "next/server"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { calculateNutrientData } from "@/foodMessageProcessing/common/calculateNutrientData"
import { createClient } from "@supabase/supabase-js"
import { Tables } from "types/supabase"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Initialize Supabase client
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const { aminoUser, error: aminoUserError } = await GetAminoUserOnRequest()
    if (aminoUserError || !aminoUser) {
      return new NextResponse(aminoUserError || "No amino user found", { status: 401 })
    }

    // 2. Get request body
    const { loggedFoodItemId, updateData } = await request.json()
    if (!loggedFoodItemId || !updateData) {
      return new NextResponse("Missing loggedFoodItemId or updateData", { status: 400 })
    }

    // 3. Fetch the logged food item
    const { data: loggedFoodItem, error: loggedFoodItemError } = await supabase
      .from("LoggedFoodItem")
      .select("*")
      .eq("id", loggedFoodItemId)
      .single() as { data: Tables<"LoggedFoodItem">; error: any }

    if (loggedFoodItemError || !loggedFoodItem) {
      return new NextResponse("Failed to fetch logged food item", { status: 404 })
    }

    // 4. Calculate new nutrients
    let newNutrients
    if (loggedFoodItem.foodItemId) {
      // If we have a foodItemId, fetch the food item info with nutrients and servings
      const { data: foodItem, error: foodItemError } = await supabase
        .from("FoodItem")
        .select("*, Nutrient(*), Serving(*)")
        .eq("id", loggedFoodItem.foodItemId)
        .single() as { data: FoodItemWithNutrientsAndServing; error: any }
 
      if (foodItemError || !foodItem) {
        return new NextResponse("Failed to fetch food item", { status: 404 })
      }

      newNutrients = calculateNutrientData(updateData.grams, foodItem)
    } else {
      // If we don't have a foodItemId, scale the previous nutrients
      const scaleFactor = updateData.grams / loggedFoodItem.grams
      newNutrients = Object.entries(loggedFoodItem).reduce((acc, [key, value]) => {
        if (typeof value === "number" && key !== "id" && key !== "grams") {
          acc[key] = value * scaleFactor
        }
        return acc
      }, {} as Record<string, number>)
    }

    // 5. Update the logged food item
    const { data: updatedLoggedFoodItem, error: updateError } = await supabase
      .from("LoggedFoodItem")
      .update({ ...updateData, ...newNutrients })
      .eq("id", loggedFoodItemId)
      .select()
      .single()

    if (updateError) {
      return new NextResponse("Failed to update logged food item", { status: 500 })
    }

    return NextResponse.json(updatedLoggedFoodItem)
  } catch (error) {
    console.error("Error in update-logged-food-item:", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

// Uncomment the following line to run the test function
//   testUpdateLoggedFoodItem()
