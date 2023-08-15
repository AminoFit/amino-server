import axios from "axios"
import { recordQuery } from "@/utils/apiUsageLogging"

const USDA_API_KEY = process.env.USDA_API_KEY
export interface UsdaSearchParams {
  query: string
  branded?: boolean // Indicates whether to filter by branded foods
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
  dataType: string
  description: string
  foodNutrients: FoodNutrient[]
  // Additional properties can be added here as needed
}

export interface UsdaSearchResponse {
  foods: UsdaFoodIdResults[]
}

type RequestParams = {
  query: string
  pageSize: number
  dataType?: string | string[]
  api_key: string | undefined
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

export async function searchFoodIds(
  params: UsdaSearchParams
): Promise<UsdaSearchResponse> {
  const API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
  const queryWords = params.query.split(" ")

  const requestParams: RequestParams = {
    query: params.query,
    pageSize: 10,
    api_key: USDA_API_KEY
  }

  let filteredFoods: UsdaFoodIdResults[] = []

  try {
    // Unbranded and Branded cases
    const dataTypesArray = params.branded
      ? ["Branded", "Foundation", "SR Legacy"]
      : ["Foundation", "SR Legacy", "Branded"]

    for (const dataType of dataTypesArray) {
      requestParams.dataType = dataType
      const completeUrl = createUrlWithParams(API_URL, requestParams)

      let response = await axios.get<UsdaSearchResponse>(API_URL, {
        params: requestParams
      })

      // Record
      recordQuery("usda", completeUrl)

      filteredFoods = response.data.foods.filter((food) =>
        queryWords.every((word) =>
          food.description.toLowerCase().includes(word.toLowerCase())
        )
      )

      if (filteredFoods.length !== 0) break
    }

    // Final try: if still no results, drop the requirement for all words
    if (filteredFoods.length === 0) {
      const completeUrl = createUrlWithParams(API_URL, requestParams)
      const response = await axios.get<UsdaSearchResponse>(API_URL, {
        params: requestParams
      })
      recordQuery("usda", completeUrl)
      filteredFoods = response.data.foods
    }

    return { foods: filteredFoods }
  } catch (error) {
    throw new Error(`Error fetching data from USDA API: ${error}`)
  }
}

async function runTests() {
  await searchFoodIds({
    query: "Burrito Chipotle",
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

// runTests();
