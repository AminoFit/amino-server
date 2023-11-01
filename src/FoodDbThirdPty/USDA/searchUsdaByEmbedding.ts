import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"
import { getCachedOrFetchEmbeddingId } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { cookies } from "next/headers"
export interface UsdaFindFoodParams {
  food_name: string
  branded?: boolean
  brand_name?: string
  bge_base_embedding?: number[]
  embedding_cache_id?: number
}

interface UsdaFoodSqlResult {
  fdcId: number
  foodName: string
  foodBrand: string | null // Assuming foodBrand can be NULL in the database
  bgeBaseEmbedding: number[] // Converted to text in the SQL query
  cosineSimilarity: number
}

const COSINE_THRESHOLD = 0.725

export async function searchUsdaByEmbedding(
  searchParams: UsdaFindFoodParams,
  DEBUG = false
): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
  let t0, t1

  // Get embedding ID (either cached or from Hugging Face)
  const embeddingId =
    searchParams.embedding_cache_id ||
    (await getCachedOrFetchEmbeddingId("BGE_BASE", searchParams.food_name, searchParams.brand_name))

  const supabase = createAdminSupabase()

  if (!embeddingId) {
    console.error("No embedding ID found")
    return null
  }
  const filteredResults: UsdaFoodSqlResult[] = []

  const isBranded = searchParams.branded

  if (isBranded) {
    const { data, error } = await supabase.rpc("get_branded_usda_embedding", {
      embeddingId
    })
    if (!data) {
      console.error("No results from get_branded_usda_embedding", error)
      return null
    }
    filteredResults.push(
      ...data
        .map((item) => ({
          ...item,
          bgeBaseEmbedding: JSON.parse(item.bgeBaseEmbedding)
        }))
        .filter((item) => item.cosineSimilarity >= COSINE_THRESHOLD)
    )
  } else {
    const { data, error } = await supabase.rpc("get_unbranded_usda_embedding", {
      embeddingId
    })
    if (!data) {
      console.error("No results from get_branded_usda_embedding", error)
      return null
    }
    filteredResults.push(
      ...data
        .map((item) => ({
          ...item,
          bgeBaseEmbedding: JSON.parse(item.bgeBaseEmbedding)
        }))
        .filter((item) => item.cosineSimilarity >= COSINE_THRESHOLD)
    )
  }

  // const whereCondition = isBranded ? `"foodBrand" IS NOT NULL` : `"foodBrand" IS NULL OR "foodBrand" = ''`
  // const sqlQuery = `
  //         SELECT
  //             "fdcId",
  //             "foodName",
  //             "foodBrand",
  //             "bgeBaseEmbedding"::text,
  //             1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = ${embeddingId})) AS cosine_similarity
  //         FROM
  //             "UsdaFoodItemEmbedding"
  //         WHERE
  //             ${whereCondition}
  //             AND "bgeBaseEmbedding" is not null
  //         ORDER BY
  //         ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache"
  //         WHERE id = ${embeddingId})) ASC
  //         LIMIT 5;
  //     `
  // const usdaCosineSimilarityAndEmbeddings: UsdaFoodSqlResult[] = await prisma.$queryRaw(raw(sqlQuery))

  const replacer = (key: string, value: any) => {
    if (key === "bgeBaseEmbedding") {
      return value.substring(0, 10) + "......" + value.substring(value.length - 10)
    }
    return value
  }

  // Filter by cosine threshold and check if there are any results left
  // const filteredResults = usdaCosineSimilarityAndEmbeddings.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)
  if (DEBUG) {
    console.log("Filtered USDA results:", JSON.stringify(filteredResults, replacer, 2))
  }
  if (filteredResults.length === 0) {
    return null
  }
  return filteredResults.map((item) => {
    return {
      foodBgeBaseEmbedding: item.bgeBaseEmbedding,
      similarityToQuery: item.cosineSimilarity,
      foodSource: "USDA",
      externalId: String(item.fdcId),
      foodName: item.foodName,
      foodBrand: item.foodBrand || undefined
    }
  })
}

async function test() {
  const params = {
    food_name: "peanut butter",
    branded: false,
    brand_name: undefined,
    embedding_cache_id: 83
  }
  const params2 = {
    food_name: "hydro whey",
    branded: true,
    brand_name: "optimum nutrition",
    bge_base_embedding: [],
    embedding_cache_id: 0
  }
  await searchUsdaByEmbedding(params)
}

test()
