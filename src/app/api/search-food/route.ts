export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { re } from "mathjs"
import { Tables } from "types/supabase"

interface FoodItemImageWithImage extends Tables<"FoodItemImages"> {
  FoodImage: Tables<"FoodImage">;
}

type FoodItemWithServingsAndImages = Partial<Tables<"FoodItem">> & {
  Serving: Tables<"Serving">[];
  FoodItemImages: FoodItemImageWithImage[]; // Now includes FoodImage
};


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

  const { foodLogString } = await request.json()

  if (!foodLogString) {
    return new Response("No foodLogString provided", { status: 400 })
  }

  const savedEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", [foodLogString])
  const supabaseAdmin = createAdminSupabase()
  // Search for the food item
  const { data: cosineSearchResults, error: searchError } = await supabaseAdmin.rpc("get_cosine_results", {
    p_embedding_cache_id: savedEmbeddings[0].id,
    amount_of_results: 10
  })

  if (searchError) {
    return new NextResponse(JSON.stringify({ error: "Error searching Database", details: searchError.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  // const { error: updateError } = await supabaseAdmin
  //   .from("FoodImage")
  //   .update({ downvotes: foodImage.downvotes + 1 })
  //   .eq("id", foodImageId)
  //   .select()
  //   .single()

  // if (updateError) {
  //   return new NextResponse(JSON.stringify({ error: "Error down-voting image", details: updateError.message }), {
  //     status: 500,
  //     headers: {
  //       "Content-Type": "application/json"
  //     }
  //   })
  // }

  // await forceGenerateNewFoodIconQueue.enqueue(foodItemId.toString())

  const uniqueFoodItemIds = cosineSearchResults.map((result) => result.id)
  const result = await supabaseAdmin
    .from("FoodItem")
    .select(
      `id, name, brand, defaultServingWeightGram,kcalPerServing,totalFatPerServing,satFatPerServing,
    transFatPerServing, carbPerServing, sugarPerServing,addedSugarPerServing, 
    proteinPerServing, userId, messageId, foodInfoSource, defaultServingLiquidMl,
    fiberPerServing, isLiquid,
    FoodItemImages(
      *, FoodImage(id, pathToImage, downvotes)
    ),
    Serving(*)`
    )
    .in("id", uniqueFoodItemIds) 

  const data = result.data as FoodItemWithServingsAndImages[]

  const FilterFoodItemImages = (foodItem: FoodItemWithServingsAndImages, topN: number = 4): FoodItemWithServingsAndImages =>{
    // Check if FoodItemImages exists and has items; if not, return the foodItem as is.
    if (!foodItem || !foodItem.FoodItemImages || foodItem.FoodItemImages.length === 0) {
      return foodItem;
    }
  
    // Sort and filter the FoodItemImages as before.
    const sortedAndFilteredImages = foodItem.FoodItemImages.sort((a, b) => {
      if (a.FoodImage.downvotes === b.FoodImage.downvotes) {
        return b.FoodImage.id - a.FoodImage.id; // Higher id comes first if downvotes are equal
      }
      return a.FoodImage.downvotes - b.FoodImage.downvotes; // Otherwise, sort by fewer downvotes
    }).slice(0, topN);
  
    // Return the foodItem with the filtered list of FoodItemImages.
    return {
      ...foodItem,
      FoodItemImages: sortedAndFilteredImages,
      foodInfoSource: "Online"
    };
  }

  const slimmedResults = cosineSearchResults.map((result) => {
    // Find the corresponding food item by ID from the fetched data array
    const foodItem = data.find((item) => item.id === result.id);
  
    // Use the GetBestFourFoodImages function to get the top 4 images for this food item
    const foodItemWithImages = FilterFoodItemImages(foodItem!);
  
    return {
      id: result.id,
      name: result.name,
      similarity: result.cosine_similarity,
      foodItem: foodItemWithImages 
    };
  });

  return new NextResponse(JSON.stringify({ results: slimmedResults }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  })
}
