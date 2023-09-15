import axios from "axios"
export interface NutritionixSearchInstantParams {
  query: string
  branded?: boolean
  brand_ids?: string[]
  branded_region?: number
  taxonomy?: boolean
  taxonomy_node_id?: string
}

export interface NutritionixSearchInstantResponse {
  branded: NutritionixBrandedItem[]
  self: NutritionixSelfItem[]
  common: NutritionixCommonItem[]
}

export interface NutritionixBrandedItem {
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

export interface NutritionixCommonItem {
  food_name: string
  image: string | null
  tag_id: string
  tag_name: string
}

const NUTRITIONIX_API_URL = "https://trackapi.nutritionix.com/v2/search/instant"

export async function searchFoodIds(
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

function runTests() {
  /*searchFoodIds({
    query: "Fiber Gummies",
    branded: true
  })
    .then((response) => {
      console.log(JSON.stringify(response))
    })
    .catch((error) => {
      console.error(`Error: ${error}`)
    })
    */

    console.log()

  /*searchFoodIds({
    query: "Apple",
    branded: false
  })
    .then((response) => {
      console.log(response)
    })
    .catch((error) => {
      console.error(`Error: ${error}`)
    })*/
}

// runTests()

//{"foods":[{"food_name":"Fiber Gummies Fiber Supplement, Orange","brand_name":"Meta Mucil","serving_qty":3,"serving_unit":"gummies","serving_weight_grams":null,"nf_metric_qty":null,"nf_metric_uom":"g","nf_calories":25,"nf_total_fat":null,"nf_saturated_fat":null,"nf_cholesterol":null,"nf_sodium":20,"nf_total_carbohydrate":10,"nf_dietary_fiber":5,"nf_sugars":2,"nf_protein":null,"nf_potassium":null,"nf_p":null,"full_nutrients":[{"attr_id":205,"value":10},{"attr_id":208,"value":25},{"attr_id":269,"value":2},{"attr_id":291,"value":5},{"attr_id":307,"value":20},{"attr_id":539,"value":0}],"nix_brand_name":"Meta Mucil","nix_brand_id":"5457c0ed53af3d475e6329ff","nix_item_name":"Fiber Gummies Fiber Supplement, Orange","nix_item_id":"639c50154711260008df8557","metadata":{},"source":8,"ndb_no":null,"tags":null,"alt_measures":null,"lat":null,"lng":null,"photo":{"thumb":"https://nutritionix-api.s3.amazonaws.com/639c50154711260008df8558.jpeg","highres":null,"is_user_uploaded":false},"note":null,"class_code":null,"brick_code":null,"tag_id":null,"updated_at":"2023-07-11T15:22:59+00:00","nf_ingredient_statement":"Inulin, Soluble Corn Fiber (Fibersol), Water, Xylitol; Less than 2% of: Pectin, Citric Acid (Ph Adjuster), Sodium Citrate, Natural Orange Flavor, Coconut Oil With Carnauba Wax, Color (Annatto)"}]}