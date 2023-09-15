import axios from "axios"
import { getFsAccessToken } from "./oauthFs"
import { FsFoodInfo, convertFsToFoodItem } from "./fsInterfaceHelper"

export interface FatSecretFindFoodParams {
  search_expression: string
  branded?: boolean
  page_number?: number
  max_results?: number
  include_sub_categories?: boolean
  flag_default_serving?: boolean
}

export async function findFatSecretFoodInfo(
  searchParams: FatSecretFindFoodParams
): Promise<FsFoodInfo[] | any> {
  console.log("Searching FatSecret for", searchParams.search_expression)
  let token
  token = await getFsAccessToken()
  if (!token) return null

  const url = "https://platform.fatsecret.com/rest/server.api"

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${token}`
  }

  const params: { [key: string]: any } = {
    method: "foods.search.v2",
    format: "json",
    ...searchParams,
    max_results: searchParams.max_results || 25
  }

  // Manually constructing the query string
  const paramsString = Object.keys(params)
    .map(
      (key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    )
    .join("&")

  try {
    const response = await axios.post(url, paramsString, { headers })
    if (
      response.data &&
      response.data.foods_search &&
      response.data.foods_search.results
    ) {
      let foods = response.data.foods_search.results.food
      // Filter the results based on the branded flag
      if (searchParams.branded === true) {
        foods = foods.filter((food: any) => food.food_type === "Brand")
      } else if (searchParams.branded === false) {
        foods = foods.filter((food: any) => food.food_type === "Generic")
      }
      // console.log("Found", foods.length, "foods")
      // console.log(foods)

      return foods as FsFoodInfo[]
    }
    console.log(response)
    return null
  } catch (error) {
    console.error(error)
    return null
  }
}


async function runTest() {
  const searchParams: FatSecretFindFoodParams = { search_expression: "Banana" }
  const result: FsFoodInfo[] = await findFatSecretFoodInfo(searchParams)
  console.log(convertFsToFoodItem(result[0]))
  // console.log(JSON.stringify(result.splice(0,10)))
  /*console.log(convertFsToFoodItem(JSON.parse(`{
    "brand_name": "Metamucil",
    "food_id": "55367381",
    "food_name": "Fiber Gummies",
    "food_type": "Brand",
    "food_url": "https://www.fatsecret.com/calories-nutrition/metamucil/fiber-gummies",
    "servings": {
      "serving": [
        {
          "added_sugars": "0",
          "calories": "25",
          "carbohydrate": "10.00",
          "cholesterol": "0",
          "fat": "0",
          "fiber": "5.0",
          "measurement_description": "serving",
          "number_of_units": "1.000",
          "protein": "0",
          "serving_description": "3 gummies",
          "serving_id": "46490652",
          "serving_url": "https://www.fatsecret.com/calories-nutrition/metamucil/fiber-gummies",
          "sodium": "20",
          "sugar": "2.00"
        }
      ]
    }
  }`)))*/
  //console.log(convertFsToFoodItem(result2[23]))
}

// runTest()
