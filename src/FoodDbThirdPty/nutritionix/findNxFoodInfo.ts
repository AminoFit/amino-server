import { openai } from "../../utils/openaiFunctionSchemas"
import { getBrandedFoodInfo, BrandedFoodResponse } from "./getBrandedFoodInfo"
import {
  searchFoodIds,
  NutritionixSearchInstantResponse,
  NutritionixBrandedItem,
  NutritionixCommonItem
} from "./searchFoodIds"
import { getNonBrandedFoodInfo, NxNonBrandedResponse } from "./getNonBrandedFoodInfo"
import { FoodItem } from "@prisma/client"

const COSINE_THRESHOLD = 0.8

type EmbeddingObject = { embedding: number[]; [key: string]: any }

interface FoodQuery {
  food_name: string
  user_food_descriptive_name: string
  branded?: boolean
  brand_name?: string
}

interface NxFoodItemResponse extends Omit<FoodItem, "Servings" | "Nutrients"> {
  Servings: {
    servingWeightGram: number
    servingName: string
  }[]
  Nutrients: {
    nutrientName: string
    nutrientUnit: string
    nutrientAmountPerGram: number
  }[]
}

type CombinedResponse = BrandedFoodResponse | NxNonBrandedResponse;

function mapFoodResponseToFoodItem(response: CombinedResponse): NxFoodItemResponse[] {
  return response.foods.map((food) => ({
    id: 0, // Replace with the proper ID once available
    name: food.food_name,
    brand: food.brand_name,
    knownAs: [], // You may need to map this properly based on your data
    description: null, // You may need to map this properly based on your data
    defaultServingWeightGram: food.serving_weight_grams,
    kcalPerServing: food.nf_calories,
    totalFatPerServing: food.nf_total_fat,
    satFatPerServing: food.nf_saturated_fat,
    transFatPerServing: null, // You may need to map this properly based on your data
    carbPerServing: food.nf_total_carbohydrate,
    sugarPerServing: food.nf_sugars,
    addedSugarPerServing: null, // You may need to map this properly based on your data
    proteinPerServing: food.nf_protein,
    lastUpdated: new Date(),
    verified: false,
    userId: null, // You may need to map this properly based on your data
    foodInfoSource: "User", // You may need to map this properly based on your data
    messageId: null, // You may need to map this properly based on your data
    Servings: food.alt_measures
      ? food.alt_measures.map((alt) => ({
          servingWeightGram: alt.serving_weight,
          servingName: alt.measure
        }))
      : [],
    Nutrients: [
      {
        nutrientName: "Cholesterol",
        nutrientUnit: "mg",
        nutrientAmountPerGram:
          food.nf_cholesterol / (food.serving_weight_grams || 1)
      },
      {
        nutrientName: "Sodium",
        nutrientUnit: "mg",
        nutrientAmountPerGram: food.nf_sodium / (food.serving_weight_grams || 1)
      },
      {
        nutrientName: "Dietary Fiber",
        nutrientUnit: "g",
        nutrientAmountPerGram:
          food.nf_dietary_fiber / (food.serving_weight_grams || 1)
      },
      {
        nutrientName: "Potassium",
        nutrientUnit: "mg",
        nutrientAmountPerGram:
          (food.nf_potassium || 0) / (food.serving_weight_grams || 1)
      }
    ]
  }));
}

async function findNxFoodInfo(
  foodQuery: FoodQuery
): Promise<NxFoodItemResponse[] | null> {
  let foodResults: NutritionixSearchInstantResponse = await searchFoodIds({
    query: foodQuery.user_food_descriptive_name,
    branded: foodQuery.branded
  })

  if (foodQuery.branded) {
    let brandedFoodOptions: NutritionixBrandedItem[] = foodResults.branded

    // create an array of all queries to get embeddings for
    const allQueries = [foodQuery.user_food_descriptive_name].concat(
      brandedFoodOptions.map((item) => item.brand_name_item_name)
    )

    // get all embeddings in a single API call
    const allEmbeddings = await getEmbedding(allQueries)

    // extract query embedding and item embeddings
    const queryEmbedding = allEmbeddings.data[0].embedding
    const itemEmbeddings = allEmbeddings.data
      .slice(1)
      .map((embeddingObject: EmbeddingObject) => embeddingObject.embedding)

    // create an array to store cosine similarities and embeddings
    const cosineSimilaritiesAndEmbeddings: Array<{
      item: NutritionixBrandedItem
      similarity: number
      embedding: number[]
    }> = []

    for (let i = 0; i < brandedFoodOptions.length; i++) {
      // calculate cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[i])

      // add to array only if similarity is 0.8 or more
      if (similarity >= COSINE_THRESHOLD) {
        cosineSimilaritiesAndEmbeddings.push({
          item: brandedFoodOptions[i],
          similarity,
          embedding: itemEmbeddings[i]
        })
      }
    }

    // sort items by cosine similarity
    cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

    // Log the desired attributes for each of the top 5 items
    for (let i = 0; i < cosineSimilaritiesAndEmbeddings.length; i++) {
      const itemInfo = cosineSimilaritiesAndEmbeddings[i]
      console.log(`Food Name: ${itemInfo.item.food_name}`)
      console.log(`ID: ${itemInfo.item.nix_item_id}`)
      console.log(`Cosine Similarity: ${itemInfo.similarity}`)
      console.log(`Brand Name: ${itemInfo.item.brand_name}`)
      console.log("-------------------------------")
    }

    // Define the number of top items to retrieve
    const topItemsCount = 3

    // Take only the top items as per 'topItemsCount'
    const topSimilarItems = cosineSimilaritiesAndEmbeddings.slice(
      0,
      topItemsCount
    )

    // Get the full info for each of the top items
    const getFoodInfoPromises = topSimilarItems.map((itemInfo) =>
      getBrandedFoodInfo({ nix_item_id: itemInfo.item.nix_item_id })
    )

    // Resolve all promises
    const mostSimilarBrandedItems: BrandedFoodResponse[] = await Promise.all(
      getFoodInfoPromises
    )

    // Log the full info for each of the top items
    mostSimilarBrandedItems.forEach((info, i) => {
      console.log(`Item ${i + 1} Full Info:`, info)
    })
    // Transform the most similar branded items into the NxFoodItemResponse format
    const transformedItems: NxFoodItemResponse[] = mostSimilarBrandedItems.flatMap(
        mapFoodResponseToFoodItem
    )

    return transformedItems
  } else {
    // handle the non-branded case here...
    let commonFoodOptions: NutritionixCommonItem[] = foodResults.common

    // create an array of all queries to get embeddings for
    const allQueries = [foodQuery.user_food_descriptive_name].concat(
      commonFoodOptions.map((item) => item.food_name)
    )

    // get all embeddings in a single API call
    const allEmbeddings = await getEmbedding(allQueries)

    // extract query embedding and item embeddings
    const queryEmbedding = allEmbeddings.data[0].embedding
    const itemEmbeddings = allEmbeddings.data
      .slice(1)
      .map((embeddingObject: EmbeddingObject) => embeddingObject.embedding)

    // create an array to store cosine similarities and embeddings
    const cosineSimilaritiesAndEmbeddings: Array<{
      item: NutritionixCommonItem
      similarity: number
      embedding: number[]
    }> = []

    for (let i = 0; i < commonFoodOptions.length; i++) {
      // calculate cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[i])

      // add to array only if similarity is 0.8 or more
      if (similarity >= COSINE_THRESHOLD) {
        cosineSimilaritiesAndEmbeddings.push({
          item: commonFoodOptions[i],
          similarity,
          embedding: itemEmbeddings[i]
        })
      }
    }

    // sort items by cosine similarity
    cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

    // Define the number of top items to retrieve
    const topItemsCount = 2

    // Take only the top items as per 'topItemsCount'
    const topSimilarItems = cosineSimilaritiesAndEmbeddings.slice(
      0,
      topItemsCount
    )

    // Get the full info for each of the top items
    const getFoodInfoPromises = topSimilarItems.map((itemInfo) =>
      getNonBrandedFoodInfo({ query: itemInfo.item.food_name })
    )

    // Resolve all promises
    const mostSimilarCommonItems: NxNonBrandedResponse[] = await Promise.all(
      getFoodInfoPromises
    )

    // Transform the most similar common items into the NxFoodItemResponse format
    const commondFoodItems: NxFoodItemResponse[] = mostSimilarCommonItems.flatMap(
        mapFoodResponseToFoodItem
    )

    return commondFoodItems
  }

  return null
}

async function getEmbedding(input: string[]): Promise<any> {
  const embedding = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: input
  })
  return embedding.data
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  // can use dot product due to embeddings being normalized
  // dot product cosine similarity is not possible on unnormalized embeddings
  let dotProduct = 0.0
  let normA = 0.0
  let normB = 0.0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += Math.pow(vecA[i], 2)
    normB += Math.pow(vecB[i], 2)
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function euclideanDistance(vecA: number[], vecB: number[]): number {
  let sum = 0
  for (let i = 0; i < vecA.length; i++) {
    sum += Math.pow(vecA[i] - vecB[i], 2)
  }
  return Math.sqrt(sum)
}

async function runTest() {
  let foodEmbedding = [
    { query: "skim milk", embedding: [] },
    { query: "skimmed milk", embedding: [] },
    { query: "skim milk", embedding: [] },
    { query: "0% milk", embedding: [] },
    { query: "fat free milk", embedding: [] },
    { query: "full fat milk", embedding: [] },
    { query: "2% milk", embedding: [] },
    { query: "2% fat milk", embedding: [] },
    { query: "semi-skimmed milk", embedding: [] }
  ]

  // make a single call to getEmbedding with all queries
  const allQueries = foodEmbedding.map((item) => item.query)
  const allEmbeddings = await getEmbedding(allQueries)

  // assign returned embeddings to the correct items
  for (let i = 0; i < foodEmbedding.length; i++) {
    foodEmbedding[i].embedding = allEmbeddings.data[i].embedding
  }

  const baseEmbedding = foodEmbedding[0].embedding
  for (let i = 1; i < foodEmbedding.length; i++) {
    const similarity = cosineSimilarity(
      baseEmbedding,
      foodEmbedding[i].embedding
    )
    console.log(
      `Similarity between "${foodEmbedding[0].query}" and "${foodEmbedding[i].query}": ${similarity}`
    )
  }
  for (let i = 1; i < foodEmbedding.length; i++) {
    const distance = euclideanDistance(
      baseEmbedding,
      foodEmbedding[i].embedding
    )
    console.log(
      `Distance between "${foodEmbedding[0].query}" and "${foodEmbedding[i].query}": ${distance}`
    )
  }
}

async function testSearch() {
    /*
  const latteResponse = await findNxFoodInfo({
    food_name: "Starbucks Iced Latte",
    user_food_descriptive_name: "Starbucks Tall Iced Latte, 2% milk",
    branded: true
  })
  console.log(JSON.stringify(latteResponse, null, 2))
  // --------------------------------
  const yogurtResponse = await findNxFoodInfo({
    food_name: "FAGE Greek Yogurt 0%",
    user_food_descriptive_name: "FAGE Greek Yogurt 0% Fat",
    branded: true
  })
  console.log(JSON.stringify(yogurtResponse, null, 2))
  */
  // --------------------------------
  const appleResponse = await findNxFoodInfo({
    food_name: "Apple",
    user_food_descriptive_name: "Royal Gala Apple",
    branded: false
  })
  console.log(JSON.stringify(appleResponse, null, 2))
  // --------------------------------
  const lasagnaResponse = await findNxFoodInfo({
    food_name: "Lasagna",
    user_food_descriptive_name: "Beef lasagna",
    branded: false
  })
  console.log(JSON.stringify(lasagnaResponse, null, 2))
}

testSearch()
//runTest()
