export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { re } from "mathjs"

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
    p_embedding_cache_id: savedEmbeddings[0].id
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

  const slimmedResults = cosineSearchResults.map((result) => {
    return {
      id: result.id,
      name: result.name,
      similarity: result.cosine_similarity
    }
  })

  return new NextResponse(JSON.stringify({ results: slimmedResults }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  })
}
