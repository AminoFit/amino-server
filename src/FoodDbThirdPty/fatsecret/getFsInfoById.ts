import axios from "axios"
import { getFsAccessToken } from "./oauthFs"
import { convertFsToFoodItem } from "./fsInterfaceHelper"
import { FsFoodInfo } from "./fsInterfaceHelper"

export async function getFatSecretFoodById(food_id: number): Promise<any> {
  console.log("Fetching FatSecret details for food ID:", food_id)

  // Get the access token
  const token = await getFsAccessToken()
  if (!token) return null

  // Define the API endpoint and headers
  const url = "https://platform.fatsecret.com/rest/server.api"
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${token}`
  }

  // Define the parameters with an index signature
  const params: { [key: string]: any } = {
    method: "food.get.v3",
    format: "json",
    food_id
  }

  // Construct the query string
  const paramsString = Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&")

  try {
    // Send the request and process the response
    const response = await axios.post(url, paramsString, { headers })
    if (response.data && response.data.food) {
      return response.data.food
    }
    console.log(response)
    return null
  } catch (error) {
    console.error(error)
    return null
  }
}

async function testGetFatSecretFoodById() {
  // const food = await getFatSecretFoodById(73105349)
  // const food = await getFatSecretFoodById(5574483)
  // console.log(food)
  // console.log(JSON.stringify(food))
  const food: FsFoodInfo = JSON.parse(
    `{"brand_name":"Clover","food_id":"73105349","food_name":"Blue Moon","food_type":"Brand","food_url":"https://www.fatsecret.com/calories-nutrition/clover/blue-moon","servings":{"serving":[{"added_sugars":"3.00","calories":"150","carbohydrate":"17.00","cholesterol":"20","fat":"4.50","fiber":"0","measurement_description":"serving","metric_serving_amount":"240.000","metric_serving_unit":"ml","number_of_units":"1.000","protein":"9.00","saturated_fat":"3.000","serving_description":"1 cup","serving_id":"59527192","serving_url":"https://www.fatsecret.com/calories-nutrition/clover/blue-moon","sodium":"260","sugar":"16.00"}]}}`
  )
  console.log(food)
  console.log(convertFsToFoodItem(food))
}

// testGetFatSecretFoodById()
