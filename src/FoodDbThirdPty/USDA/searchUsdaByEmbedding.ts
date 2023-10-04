import { prisma } from "../../database/prisma"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"
import { FoodInfoSource } from "@prisma/client"
import { raw } from "@prisma/client/runtime/library"
import { getCachedOrFetchEmbeddingId } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
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
  bgeBaseEmbedding: string // Converted to text in the SQL query
  cosine_similarity: number
}

const COSINE_THRESHOLD = 0.725



export async function searchUsdaByEmbedding(
    searchParams: UsdaFindFoodParams
  ): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
      let t0, t1;
  
      // Get embedding ID (either cached or from Hugging Face)
      const embeddingId = searchParams.embedding_cache_id || await getCachedOrFetchEmbeddingId('BGE_BASE',searchParams.food_name, searchParams.brand_name);
    
      // Benchmark Prisma query
      const isBranded = searchParams.branded;
      const whereCondition = isBranded ? `"foodBrand" IS NOT NULL` : `"foodBrand" IS NULL OR "foodBrand" = ''"`;
      const sqlQuery = `
          SELECT 
              "fdcId", 
              "foodName", 
              "foodBrand", 
              "bgeBaseEmbedding"::text, 
              1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = ${embeddingId})) AS cosine_similarity 
          FROM 
              "UsdaFoodItemEmbedding" 
          WHERE 
              ${whereCondition}
              AND "bgeBaseEmbedding" is not null
          ORDER BY 
          ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" 
          WHERE id = ${embeddingId})) ASC
          LIMIT 5;
      `;
      const usdaCosineSimilarityAndEmbeddings: UsdaFoodSqlResult[] = await prisma.$queryRaw(raw(sqlQuery)); 
  
      const replacer = (key:string, value: any) => {
        if (key === "bgeBaseEmbedding") {
          return value.substring(0, 10) + "......" + value.substring(value.length - 10);
        }
        return value;
      };
            
      // Filter by cosine threshold and check if there are any results left
      const filteredResults = usdaCosineSimilarityAndEmbeddings.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)
  
      console.log("Filtered USDA results:", JSON.stringify(filteredResults, replacer, 2));
      if (filteredResults.length === 0) {
          return null;
      }
      return filteredResults.map((item) => ({
        foodBgeBaseEmbedding: item.bgeBaseEmbedding.split(",").map(Number),
          similarityToQuery: item.cosine_similarity,
          foodSource: FoodInfoSource.USDA,
          externalId: String(item.fdcId),
          foodName: item.foodName,
          foodBrand: item.foodBrand || undefined
      }));
  }

async function test() {
  await searchUsdaByEmbedding({
    food_name: "hydro whey",
    branded: true,
    brand_name: "optimum nutrition",
    bge_base_embedding: [],
    embedding_cache_id: 0
  })
}

test()
