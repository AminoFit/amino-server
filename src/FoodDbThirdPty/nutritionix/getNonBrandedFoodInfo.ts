import axios from "axios"
import path from "path"
import dotenv from "dotenv"
const envPath = path.resolve(__dirname, "../../../.env.local")

dotenv.config({ path: envPath })

const NUTRITIONIX_ENDPOINT =
  "https://trackapi.nutritionix.com/v2/natural/nutrients"

interface NxFood {
  food_name: string
  brand_name: string | null
  serving_qty: number
  serving_unit: string
  serving_weight_grams: number
  nf_calories: number
  nf_total_fat: number
  nf_saturated_fat: number
  nf_cholesterol: number
  nf_sodium: number
  nf_total_carbohydrate: number
  nf_dietary_fiber: number
  nf_sugars: number
  nf_protein: number
  nf_potassium: number
  nf_p: number
  full_nutrients: Nutrient[]
  nix_brand_name: string | null
  nix_brand_id: string | null
  nix_item_name: string | null
  nix_item_id: string | null
  upc: string | null
  consumed_at: string
  metadata: Record<string, unknown> // empty object but can contain any key-value pairs
  source: number
  ndb_no: number
  tags: Tag
  alt_measures: AltServing[]
  lat: string | null
  lng: string | null
  meal_type: number
  photo: Photo
}

interface Nutrient {
  attr_id: number
  value: number
}

interface Tag {
  item: string
  measure: string
  quantity: string
  tag_id: number
}

interface AltServing {
  serving_weight: number
  measure: string
  seq: number
  qty: number
}

interface Photo {
  thumb: string
  highres: string
}

interface NutrientResponse {
  foods: NxFood[]
}

interface FoodQuery {
  query: string
  timezone?: string
}

async function getFoodNutrients(
  foodQuery: FoodQuery
): Promise<NutrientResponse> {
  console.log("x-app-id", process.env.NUTRITIONIX_APP_ID)
  console.log("x-app-key", process.env.NUTRITIONIX_API_KEY)
  const response = await axios.post<NutrientResponse>(
    NUTRITIONIX_ENDPOINT,
    foodQuery,
    {
      headers: {
        "Content-Type": "application/json",
        "x-app-id": process.env.NUTRITIONIX_APP_ID,
        "x-app-key": process.env.NUTRITIONIX_API_KEY
      }
    }
  )

  return response.data as NutrientResponse
}

getFoodNutrients({ query: "apple" }).then((res) => console.log(res))
