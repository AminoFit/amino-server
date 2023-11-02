import { getCachedOrFetchEmbeddings } from "../../utils/embeddingsCache/getCachedOrFetchEmbeddings"
import {
  searchFoodIds,
  NutritionixSearchInstantResponse,
  NutritionixBrandedItem,
  NutritionixCommonItem
} from "./searchFoodIds"
import { cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { isNutritionixBrandedItem } from "./nxInterfaceHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"

const COSINE_THRESHOLD = 0.8
export interface FoodQuery {
  food_name: string
  food_full_name: string
  queryBgeBaseEmbedding: number[]
  branded?: boolean
  brand_name?: string
}

interface foodItemWithEmbeddings {
  item: NutritionixBrandedItem | NutritionixCommonItem
  similarity: number
  bgeBaseEmbedding: number[]
}

// Utility function to decide if brand name should be added
const includeBrandName = (description: string, brand: string) => {
  return description.toLowerCase().includes(brand.toLowerCase()) ? description : `${description} - ${brand}`
}

export async function findNxFoodInfo(
  foodQuery: FoodQuery,
  DEBUG = false
): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
  let foodResults: NutritionixSearchInstantResponse = await searchFoodIds({
    query: foodQuery.food_full_name,
    branded: foodQuery.branded
  })

  // Create an array of all queries to get embeddings for
  const mainQuery = includeBrandName(foodQuery.food_full_name, foodQuery.brand_name || "").toLowerCase()

  const queryEmbedding = foodQuery.queryBgeBaseEmbedding
  console.log("query NX:", mainQuery)

  // create an array to store cosine similarities and embeddings
  const cosineSimilaritiesAndEmbeddings: foodItemWithEmbeddings[] = []

  // Handle the branded search case
  let brandedFoodOptions: NutritionixBrandedItem[] = foodResults.branded

  // only process if we have branded food options to evaluate
  if (brandedFoodOptions && brandedFoodOptions.length > 0) {
    const allQueries = [
      ...(brandedFoodOptions?.map((item) =>
        includeBrandName(item.food_name, item.brand_name_item_name).toLowerCase()
      ) ?? [])
    ]

    // get all embeddings in a single API call
    const allEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", allQueries)

    const itemEmbeddings = allEmbeddings.map(
      (embeddingObject: { id: number; embedding: number[]; text: string }) => embeddingObject.embedding
    )

    for (let i = 0; i < brandedFoodOptions.length; i++) {
      // calculate cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[i])

      // add to array only if similarity is above threshold
      if (similarity >= COSINE_THRESHOLD) {
        cosineSimilaritiesAndEmbeddings.push({
          item: brandedFoodOptions[i],
          similarity,
          bgeBaseEmbedding: itemEmbeddings[i]
        })
      }
    }

    // sort items by cosine similarity
    cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)
  }
  // handle the non-branded case here...
  let commonFoodOptions: NutritionixCommonItem[] = foodResults.common

  // Only process if we have common food options to evaluate
  if (commonFoodOptions && commonFoodOptions.length > 0) {
    // create an array of all queries to get embeddings for
    const commondFoodQueries = commonFoodOptions?.map((item) => `${item.food_name}`.toLowerCase()) ?? []

    // get all embeddings in a single API call
    const commondFoodEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", commondFoodQueries)

    // extract item embeddings
    const commonFoodEmbeddings = commondFoodEmbeddings.map(
      (embeddingObject: { id: number; embedding: number[]; text: string }) => embeddingObject.embedding
    )

    for (let i = 0; i < commonFoodOptions.length; i++) {
      // calculate cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, commonFoodEmbeddings[i])

      // add to array only if similarity is 0.8 or more
      if (similarity >= COSINE_THRESHOLD) {
        cosineSimilaritiesAndEmbeddings.push({
          item: commonFoodOptions[i],
          similarity,
          bgeBaseEmbedding: commonFoodEmbeddings[i]
        })
      }
    }
  }

  // sort items by cosine similarity
  cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

  if (DEBUG) {
    console.log("Nutritionix results:")
    cosineSimilaritiesAndEmbeddings.slice(0, 3).forEach((itemInfo) => {
      if (isNutritionixBrandedItem(itemInfo.item)) {
        console.log(
          `Item: ${itemInfo.item.food_name} by ${itemInfo.item.brand_name} has similarity ${itemInfo.similarity}`
        )
      } else {
        console.log(`Item: ${itemInfo.item.food_name} has similarity ${itemInfo.similarity}`)
      }
    })
  }

  // Take only the top items as per 'topItemsCount'
  const topSimilarItems = cosineSimilaritiesAndEmbeddings.slice(0, 3)

  // Get the full info for each of the top items
  if (topSimilarItems.length === 0) {
    return null
  }

  const mappedResults: foodSearchResultsWithSimilarityAndEmbedding[] = cosineSimilaritiesAndEmbeddings.map((item) => ({
    foodBgeBaseEmbedding: item.bgeBaseEmbedding,
    similarityToQuery: item.similarity,
    foodSource: "NUTRITIONIX",
    foodName: item.item.food_name,
    externalId: "nix_item_id" in item.item ? item.item.nix_item_id : undefined,
    foodBrand: "nix_item_id" in item.item ? item.item.brand_name : undefined
  }))

  return mappedResults.slice(0, 3)
  /*
  if (isNutritionixBrandedItem(topSimilarItems[0].item)) {
    const getFoodInfoPromises = topSimilarItems.map((itemInfo) =>
      getBrandedFoodInfo({
        nix_item_id: (itemInfo.item as NutritionixBrandedItem).nix_item_id
      })
    )
    // Resolve all promises
    const mostSimilarBrandedItems: BrandedFoodResponse[] = await Promise.all(
      getFoodInfoPromises
    )

    // console.dir(mostSimilarBrandedItems, { depth: null })

    // Transform the most similar branded items into the NxFoodItemResponse format
    const transformedItems: NxFoodItemResponse[] =
      mostSimilarBrandedItems.flatMap(mapFoodResponseToFoodItem)

    return transformedItems
  } else {
    // This is in the case the non-branded item is the most similar
    // Get the full info for each of the top items
    const getFoodInfoPromises = topSimilarItems.map((itemInfo) =>
      getNonBrandedFoodInfo({ query: itemInfo.item.food_name })
    )

    // Resolve all promises
    const mostSimilarCommonItems: NxNonBrandedResponse[] = await Promise.all(
      getFoodInfoPromises
    )

    //console.dir(mostSimilarCommonItems, { depth: null })

    // Transform the most similar common items into the NxFoodItemResponse format
    const commondFoodItems: NxFoodItemResponse[] =
      mostSimilarCommonItems.flatMap(mapFoodResponseToFoodItem)

    return commondFoodItems
  }
  */
}

async function runTest() {
  let foodEmbedding = [
    { query: "Starbucks Iced Latte whole milk, Venti", embedding: [] as number[] },
    { query: "Iced Vanilla Latte with Whole Milk, Venti Starbucks", embedding: [] },
    { query: "Iced Caffe Latte with Whole Milk, Venti Starbucks", embedding: [] },
    { query: "Iced Latte Macchiato with Whole Milk, Venti Starbucks", embedding: [] },
    { query: "Starbucks Iced Latte, whole milk, venti", embedding: [] },
    { query: "0% milk", embedding: [] },
    { query: "fat free milk", embedding: [] },
    { query: "full fat milk", embedding: [] },
    { query: "2% milk", embedding: [] },
    { query: "2% fat milk", embedding: [] },
    { query: "semi-skimmed milk", embedding: [] }
  ]

  // make a single call get all queries
  const allQueries = foodEmbedding.map((item) => item.query)
  const allEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", allQueries)

  // assign returned embeddings to the correct items
  for (let i = 0; i < foodEmbedding.length; i++) {
    foodEmbedding[i].embedding = allEmbeddings[i].embedding
  }

  const baseEmbedding = foodEmbedding[0].embedding
  for (let i = 1; i < foodEmbedding.length; i++) {
    const similarity = cosineSimilarity(baseEmbedding, foodEmbedding[i].embedding)
    console.log(`Similarity between "${foodEmbedding[0].query}" and "${foodEmbedding[i].query}": ${similarity}`)
  }
}

async function testSearch() {
  const query = "RXBAR"
  const queryEmbedding = (await getCachedOrFetchEmbeddings("BGE_BASE", [query]))[0].embedding
  const rxbarResponse = await findNxFoodInfo({
    food_name: query,
    queryBgeBaseEmbedding: queryEmbedding,
    food_full_name: query,
    branded: true
  })
  const replacer = (key: string, value: any) => {
    if (key === "foodEmbedding" && Array.isArray(value)) {
      return "[VECTOR_TO_SHORTEN]"
    }
    return value
  }

  //console.log(JSON.stringify(rxbarResponse, replacer, 2));
  /*
  // --------------------------------
  const yogurtResponse = await findNxFoodInfo({
    food_name: "FAGE Greek Yogurt 0%",
    user_food_descriptive_name: "FAGE Greek Yogurt 0% Fat",
    branded: true
  })
  console.log(JSON.stringify(yogurtResponse, null, 2))
  
  // --------------------------------
  const appleResponse = await findNxFoodInfo({
    food_name: "Apple",
    user_food_descriptive_name: "Royal Gala Apple",
    branded: false
  })
  console.log(JSON.stringify(appleResponse, null, 2))
  */
  // --------------------------------
  /*const lasagnaResponse = await findNxFoodInfo({
    food_name: "Lasagna",
    user_food_descriptive_name: "Beef lasagna",
    branded: false
  })
  console.log(JSON.stringify(lasagnaResponse, null, 2))*/
  /*const latteResponse: BrandedFoodResponse[] = JSON.parse(`[{"foods":[{"food_name":"Iced Caffe Latte with 2% Milk, Tall","brand_name":"Starbucks","serving_qty":12,"serving_unit":"fl oz","serving_weight_grams":null,"nf_metric_qty":null,"nf_metric_uom":null,"nf_calories":100,"nf_total_fat":3.5,"nf_saturated_fat":2,"nf_cholesterol":15,"nf_sodium":90,"nf_total_carbohydrate":10,"nf_dietary_fiber":0,"nf_sugars":9,"nf_protein":6,"nf_potassium":null,"nf_p":null,"full_nutrients":[{"attr_id":203,"value":6},{"attr_id":204,"value":3.5},{"attr_id":205,"value":10},{"attr_id":208,"value":100},{"attr_id":269,"value":9},{"attr_id":291,"value":0},{"attr_id":307,"value":90},{"attr_id":601,"value":15},{"attr_id":605,"value":0},{"attr_id":606,"value":2}],"nix_brand_name":"Starbucks","nix_brand_id":"513fbc1283aa2dc80c00001f","nix_item_name":"Iced Caffe Latte with 2% Milk, Tall","nix_item_id":"ddee444151a811d119818684","metadata":{},"source":8,"ndb_no":null,"tags":null,"alt_measures":null,"lat":null,"lng":null,"photo":{"thumb":"https://d2eawub7utcl6.cloudfront.net/images/nix-apple-grey.png","highres":null,"is_user_uploaded":false},"note":null,"class_code":null,"brick_code":null,"tag_id":null,"updated_at":"2017-09-25T20:59:13+00:00","nf_ingredient_statement":null}]}]`)
  console.dir(mapFoodResponseToFoodItem(latteResponse[0]), { depth: null })*/
}

//testSearch()
// runTest()
