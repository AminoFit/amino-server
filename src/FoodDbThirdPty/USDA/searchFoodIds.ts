import axios from "axios"
import {
  getAdaEmbedding,
  cosineSimilarity
} from "../../openai/utils/embeddingsHelper"
import { recordQuery } from "../../utils/apiUsageLogging"
import { levenshteinDistance, wordLevenshtein, toTitleCase } from "../../utils/nlpHelper"

const COSINE_THRESHOLD = 0.85
const COSINE_THRESHOLD_STOP = 0.95

const LEVENSHTEIN_THRESHOLD = 3

const USDA_API_KEY = process.env.USDA_API_KEY
export interface UsdaSearchParams {
  query: string
  branded?: boolean
  brand_name?: string
  alternate_query?: string
  query_embedding?: number[]
}

export interface FoodNutrient {
  number: number
  name: string
  amount: number
  unitName: string
  derivationCode: string
  derivationDescription: string
}

export interface UsdaFoodIdResults {
  fdcId: number
  description: string
  scientificName?: string
  commonNames?: string
  additionalDescriptions?: string
  dataType: string
  ndbNumber?: number
  gtinUpc?: string
  publishedDate?: string
  brandName?: string
  ingredients?: string
  marketCountry?: string
  foodCategory?: string
  modifiedDate?: string
  mostRecentAcquisitionDate?: string
  dataSource?: string
  packageWeight?: string
  servingSizeUnit?: string
  servingSize?: number
  householdServingFullText?: string
  shortDescription?: string
  allHighlightFields?: string
  score: number
  foodNutrients: FoodNutrient[]
  embedding?: number[]
  similarity?: number
}

export interface UsdaSearchResponse {
  foods: UsdaFoodIdResults[]
}

type RequestParams = {
  query: string
  pageSize: number
  dataType?: string | string[]
  api_key: string | undefined
  requireAllWords?: boolean
}

function printFilteredFoods(filteredFoods: UsdaFoodIdResults[]): void {
  filteredFoods.forEach((food) => {
    console.log(`Description: ${food.description}`)
    console.log(`Brand Name: ${food.brandName}`)
    console.log(`Similarity: ${food.similarity}`)
    console.log("-------------------------")
  })
}

async function filterFoodsByEmbeddingSimilarity(
  queryEmbedding: number[],
  foods: UsdaFoodIdResults[]
): Promise<[UsdaFoodIdResults[], boolean]> {
  // Create an array to store foods that meet the threshold
  let filteredFoods: UsdaFoodIdResults[] = []

  for (let food of foods) {
    // Get the embedding for the food description
    const nameToEmbed = food.brandName
      ? `${toTitleCase(food.description)} - ${toTitleCase(food.brandName)}`
      : toTitleCase(food.description)
    const foodResultEmbedding = await getAdaEmbedding([nameToEmbed.toLowerCase()])

    // Calculate the cosine similarity
    const similarity = cosineSimilarity(
      queryEmbedding,
      foodResultEmbedding.data[0].embedding
    )

    // If the similarity is above the threshold, add the food to the list
    if (similarity >= COSINE_THRESHOLD) {
      food.embedding = foodResultEmbedding.data[0].embedding
      food.similarity = similarity
      food.description = toTitleCase(food.description)
      filteredFoods.push(food)

      // If the similarity is above the stop threshold, return the list immediately
      if (similarity >= COSINE_THRESHOLD_STOP) {
        return [filteredFoods, true]
      }
    }
  }

  return [filteredFoods, false]
}

function filterFoodsByBrand(
  foods: UsdaFoodIdResults[],
  brandName: string
): UsdaFoodIdResults[] {
  return foods.filter((food) => {
    if (food.brandName) {
      const distance = levenshteinDistance(
        food.brandName,
        brandName,
        LEVENSHTEIN_THRESHOLD
      )
      // If the distance is higher than the threshold, do a second check using wordLevenshtein
      if (distance > LEVENSHTEIN_THRESHOLD) {
        const wordDistance = wordLevenshtein(food.brandName, brandName, 2)
        return wordDistance <= 1
      }
      return distance <= LEVENSHTEIN_THRESHOLD
    }
    return false
  })
}

function createUrlWithParams(baseUrl: string, params: any): string {
  const url = new URL(baseUrl)
  Object.keys(params).forEach((key) => {
    const value = params[key as keyof typeof params]
    if (value !== undefined) {
      url.searchParams.append(key, String(value))
    }
  })
  return url.toString()
}

/*export async function searchFoodIds(
  params: UsdaSearchParams
): Promise<UsdaSearchResponse> {
  const API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
  const queryWords = params.query.split(" ")

  let requestParams: RequestParams = {
    query: params.query,
    pageSize: 15,
    api_key: USDA_API_KEY,
    requireAllWords: true
  }

  let filteredFoods: UsdaFoodIdResults[] = []

  // get the embedding for the search query
  // Used to determine if the query matches the results well enough to stop searching
  let queryEmbedding: number[] = []
  if (params.query_embedding) {
    queryEmbedding = params.query_embedding
  } else {
    const nameToEmbed = (params.brand_name
      ? `${params.query} - ${params.brand_name}`
      : params.query).toLowerCase()
    queryEmbedding = (await getAdaEmbedding([nameToEmbed])).data[0].embedding
  }


  try {
    // Unbranded and Branded cases
    const dataTypesArray = params.branded
      ? ["Branded", "Foundation", "SR Legacy"]
      : ["Foundation", "SR Legacy", "Branded"]

    // create an array of promises to make the API calls
    const promises: Promise<UsdaSearchResponse>[] = []

    for (const dataType of dataTypesArray) {
      // first try with the default data type query
      requestParams.dataType = dataType
      requestParams.query = params.query
      let completeUrl = createUrlWithParams(API_URL, requestParams)

      // Push the axios request promise into the promises array
      promises.push(axios.get<UsdaSearchResponse>(API_URL, {params: requestParams}).then((response) => response.data))

      // Record usage to the database
      recordQuery("usda", completeUrl)

      if ( params.alternate_query || (params.brand_name && dataType === "Branded")) {
        if (params.alternate_query) {
          requestParams.query = params.alternate_query
        } else if (params.brand_name && dataType === "Branded") {
          requestParams.query = params.brand_name
        }
        completeUrl = createUrlWithParams(API_URL, requestParams)

        promises.push(
          axios
            .get<UsdaSearchResponse>(API_URL, {
              params: requestParams
            })
            .then((response) => response.data)
        )
        // record usage to db
        recordQuery("usda", completeUrl)
      }

      // Await all promises
      const responses = await Promise.all(promises)

      // create a stop threshold use to determine if the query matches the results well enough to stop searching
      let stopThresholdMet = false

      // Process each response
      for (const response of responses) {
        // filter by cosine similarity
        let [newFilteredFoods, newStopThresholdMet] = await filterFoodsByEmbeddingSimilarity(queryEmbedding,response.foods as UsdaFoodIdResults[])
        // filter by brand name
        if (params.brand_name && dataType === "Branded") {
          newFilteredFoods = filterFoodsByBrand(newFilteredFoods,params.brand_name)
        }

        filteredFoods = [...filteredFoods, ...newFilteredFoods]
        stopThresholdMet = stopThresholdMet || newStopThresholdMet
      }

      stopThresholdMet = stopThresholdMet || filteredFoods.length > 5
      if (stopThresholdMet) break
    }

    // Final try: if still no results, drop the requirement for all words
    if (filteredFoods.length === 0) {
      requestParams.requireAllWords = false
      const completeUrl = createUrlWithParams(API_URL, requestParams)
      const response = await axios.get<UsdaSearchResponse>(API_URL, {
        params: requestParams
      })
      recordQuery("usda", completeUrl)
      let [newFilteredFoods, stopThresholdMet] =
        await filterFoodsByEmbeddingSimilarity(
          queryEmbedding,
          response.data.foods as UsdaFoodIdResults[]
        )
      filteredFoods = [...filteredFoods, ...newFilteredFoods]
    }

    filteredFoods.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    filteredFoods = filteredFoods.slice(0, 10)

    return { foods: filteredFoods }
  } catch (error) {
    throw new Error(`Error fetching data from USDA API: ${error}`)
  }
}
*/
/*
async function runTests() {
  await searchFoodIds({
    query: "Triple Zero Strawberry Yogurt",
    brand_name: "Oikos",
    branded: true
  })
    .then((response) => {
      console.log(response)
    })
    .catch((error) => {
      console.error(`Error: ${error}`)
    })

  await searchFoodIds({
    query: "Apple",
    branded: false
  })
    .then((response) => {
      console.log(response)
    })
    .catch((error) => {
      console.error(`Error: ${error}`)
    })
    
}
*/
// runTests()
