export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"

import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function GET(
  request: NextRequest // needed so we don't cache this request
) {
  const searchParams = request.nextUrl.searchParams
  const foodDescription = searchParams.get("foodDescription")

  console.log("foodDescription", foodDescription)

  if (!foodDescription) {
    return new Response("No foodDescription provided", { status: 400 })
  }

  const supabaseAdmin = createAdminSupabase()

  const savedEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", [foodDescription])

  const embeddingId = savedEmbeddings[0].id

  // Call the Supabase function to get top similar images
  const { data: similarImages, error: similarityError } = await supabaseAdmin.rpc(
    "get_top_foodimage_embedding_similarity",
    { p_embedding_cache_id: embeddingId }
  )

  if (similarityError) {
    return new NextResponse(JSON.stringify({ error: "Error searching Database", details: similarityError.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  const slimmedResults = similarImages.map((result) => {
    return {
      foodImageId: result.food_image_id,
      description: result.image_description,
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
