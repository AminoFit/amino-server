import axios from "axios"
import path from "path"
import dotenv from "dotenv"
const envPath = path.resolve(__dirname, "../../../.env.local")

dotenv.config({ path: envPath })

interface NutritionixSearchInstantParams {
  query: string
  branded?: boolean
  brand_ids?: string[]
  branded_region?: number
  taxonomy?: boolean
  taxonomy_node_id?: string
}

interface NutritionixSearchInstantResponse {
  branded: NutritionixBrandedItem[]
  self: NutritionixSelfItem[]
  common: NutritionixCommonItem[]
}

interface NutritionixBrandedItem {
  food_name: string
  image: string | null
  serving_unit: string
  nix_brand_id: string
  brand_name_item_name: string
  serving_qty: number
  nf_calories: number
  brand_name: string
  brand_type: number
  nix_item_id: string
}

interface NutritionixSelfItem {
  food_name: string
  serving_unit: string
  nix_brand_id: string | null
  serving_qty: number
  nf_calories: number
  brand_name: string | null
  uuid: string
  nix_item_id: string | null
}

interface NutritionixCommonItem {
  food_name: string
  image: string | null
  tag_id: string
  tag_name: string
}

const NUTRITIONIX_API_URL = "https://trackapi.nutritionix.com/v2/search/instant"

async function searchFood(
  params: NutritionixSearchInstantParams
): Promise<NutritionixSearchInstantResponse> {
  const url = new URL(NUTRITIONIX_API_URL)

  // Set the query parameters
  Object.keys(params).forEach((key) => {
    const value = params[key as keyof NutritionixSearchInstantParams]
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach((val) => url.searchParams.append(key, String(val)))
      } else {
        url.searchParams.append(key, String(value))
      }
    }
  })

  console.log("app id", process.env.NUTRITIONIX_APP_ID)
  console.log("app key", process.env.NUTRITIONIX_API_KEY)

  const response = await axios.get(url.toString(), {
    headers: {
      "x-app-id": process.env.NUTRITIONIX_APP_ID,
      "x-app-key": process.env.NUTRITIONIX_API_KEY
    }
  })

  if (response.status !== 200) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.data as NutritionixSearchInstantResponse
}

searchFood({
  query: "Starbucks latte",
  branded: true
})
  .then((response) => {
    console.log(response)
  })
  .catch((error) => {
    console.error(`Error: ${error}`)
  })

  searchFood({
    query: "Apple",
    branded: false
  })
    .then((response) => {
      console.log(response)
    })
    .catch((error) => {
      console.error(`Error: ${error}`)
    })