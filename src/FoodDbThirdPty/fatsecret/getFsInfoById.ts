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
  // const food = await getFatSecretFoodById(5574483)
  // console.log(food)
  // console.log(JSON.stringify(food))
  const food: FsFoodInfo = JSON.parse(
    `{"brand_name":"Snickers","food_id":"5574483","food_name":"Snickers Bites","food_type":"Brand","food_url":"https://www.fatsecret.com/calories-nutrition/snickers/snickers-bites","servings":{"serving":[{"calories":"190","carbohydrate":"25.00","cholesterol":"5","fat":"9.00","measurement_description":"serving","number_of_units":"1.000","protein":"3.00","saturated_fat":"3.500","serving_description":"8 pieces","serving_id":"5415972","serving_url":"https://www.fatsecret.com/calories-nutrition/snickers/snickers-bites","sodium":"95","sugar":"21.00"}]}}`
  )
  console.log(food)
  console.log(convertFsToFoodItem(food))
}

//testGetFatSecretFoodById()
