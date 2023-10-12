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
  //const food = await getFatSecretFoodById(56568)
  const food: FsFoodInfo = JSON.parse(`{"brand_name":"McDonald's","food_id":"56568","food_name":"McFlurry with Oreo Cookies","food_type":"Brand","food_url":"https://www.fatsecret.com/calories-nutrition/mcdonalds/mcflurry-with-oreo-cookies","servings":{"serving":[{"added_sugars":"48.00","calcium":"380","calories":"510","carbohydrate":"80.00","cholesterol":"40","fat":"16.00","fiber":"1.0","iron":"1.50","measurement_description":"serving","number_of_units":"1.000","potassium":"540","protein":"12.00","saturated_fat":"8.000","serving_description":"1 serving","serving_id":"99102","serving_url":"https://www.fatsecret.com/calories-nutrition/mcdonalds/mcflurry-with-oreo-cookies","sodium":"260","sugar":"60.00","trans_fat":"0.500"}]}}`)
  console.log(food)
  console.log(convertFsToFoodItem(food))
}

//testGetFatSecretFoodById()