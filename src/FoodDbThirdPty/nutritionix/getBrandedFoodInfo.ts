import { recordQuery } from "@/utils/apiUsageLogging"
import axios from "axios"

const NUTRITIONIX_BRANDED_ITEM_URL =
  "https://trackapi.nutritionix.com/v2/search/item"

export interface BrandedFoodParams {
  nix_item_id?: string
  upc?: number
  rw_sin?: number
  claims?: boolean
  taxonomy?: boolean
}

interface AltServing {
  serving_weight: number
  measure: string
  seq: number
  qty: number
}

export interface BrandedFoodResponse {
  foods: {
    food_name: string
    brand_name: string
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
    nf_potassium: number | null
    nf_p: number | null
    full_nutrients: {
      attr_id: number
      value: number
    }[]
    nix_brand_name: string
    nix_brand_id: string
    nix_item_name: string
    nix_item_id: string
    metadata: Record<string, unknown>
    source: number
    ndb_no: number | null
    tags: any
    alt_measures: AltServing[]
    photo: {
      thumb: string
      highres: string | null
    }
  }[]
}

export async function getBrandedFoodInfo(
  params: BrandedFoodParams
): Promise<BrandedFoodResponse> {
  const url = new URL(NUTRITIONIX_BRANDED_ITEM_URL)

  // Add the provided parameters to the URL
  Object.keys(params).forEach((key) => {
    const value = params[key as keyof BrandedFoodParams]
    if (value !== undefined) {
      url.searchParams.append(key, String(value))
    }
  })

  const response = await axios.get(url.toString(), {
    headers: {
      "x-app-id": process.env.NUTRITIONIX_APP_ID || "",
      "x-app-key": process.env.NUTRITIONIX_API_KEY || ""
    }
  })

  // no need to await this
  recordQuery("nutritionix", url.toString())

  if (response.status !== 200) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.data as BrandedFoodResponse
}

// debug
// getBrandedFoodInfo({ nix_item_id: "61cc6887a8c268000a380d73" }).then((res) => console.log(JSON.stringify(res)))
