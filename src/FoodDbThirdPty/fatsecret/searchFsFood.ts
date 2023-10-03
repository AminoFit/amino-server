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
  queryBgeBaseEmbedding: number[]
}

// this function directly interacts with the FatSecret API
// and returns the response as is
// use findFsFoodInfo to get the best result using embeddings
// to rank the results which is a lot more accurate
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
  // 23132229 : turkey sliced by WF
  //const searchParams: FatSecretFindFoodParams = { search_expression: "Turkey Neck" }
  //const result: FsFoodInfo[] = await findFatSecretFoodInfo(searchParams)
  const slicedTurkey = JSON.parse(`{"food_id":"1776","food_name":"Turkey Neck","food_type":"Generic","food_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked","servings":{"serving":[{"calcium":"19","calories":"91","carbohydrate":"0","cholesterol":"62","fat":"3.67","fiber":"0","iron":"1.16","measurement_description":"oz, with bone, cooked (yield after bone removed)","metric_serving_amount":"51.000","metric_serving_unit":"g","monounsaturated_fat":"0.834","number_of_units":"3.000","polyunsaturated_fat":"1.103","potassium":"75","protein":"13.58","saturated_fat":"1.234","serving_description":"3 oz, with bone cooked (yield after bone removed)","serving_id":"7034","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=7034&portionamount=3.000","sodium":"193","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"5","calories":"25","carbohydrate":"0","cholesterol":"17","fat":"1.01","fiber":"0","iron":"0.32","measurement_description":"oz, with bone, raw (yield after cooking, bone removed)","metric_serving_amount":"14.000","metric_serving_unit":"g","monounsaturated_fat":"0.229","number_of_units":"1.000","polyunsaturated_fat":"0.303","potassium":"21","protein":"3.73","saturated_fat":"0.339","serving_description":"1 oz, with bone (yield after cooking, bone removed)","serving_id":"6498","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=6498&portionamount=1.000","sodium":"53","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"50","calories":"242","carbohydrate":"0","cholesterol":"163","fat":"9.72","fiber":"0","iron":"3.08","measurement_description":"cup, diced, cooked","metric_serving_amount":"135.000","metric_serving_unit":"g","monounsaturated_fat":"2.209","number_of_units":"1.000","polyunsaturated_fat":"2.918","potassium":"200","protein":"35.94","saturated_fat":"3.267","serving_description":"1 cup diced, cooked","serving_id":"5995","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=5995&portionamount=1.000","sodium":"510","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"56","calories":"272","carbohydrate":"0","cholesterol":"184","fat":"10.94","fiber":"0","iron":"3.47","measurement_description":"serving (152g)","metric_serving_amount":"152.000","metric_serving_unit":"g","monounsaturated_fat":"2.487","number_of_units":"1.000","polyunsaturated_fat":"3.286","potassium":"225","protein":"40.46","saturated_fat":"3.678","serving_description":"1 serving (152 g)","serving_id":"6465","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=6465&portionamount=1.000","sodium":"575","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"43","calories":"208","carbohydrate":"0","cholesterol":"140","fat":"8.35","fiber":"0","iron":"2.64","measurement_description":"small neck (from 11 to 13 lb turkey)","metric_serving_amount":"116.000","metric_serving_unit":"g","monounsaturated_fat":"1.898","number_of_units":"1.000","polyunsaturated_fat":"2.508","potassium":"172","protein":"30.88","saturated_fat":"2.807","serving_description":"1 small (from 11 to 13 lb turkey)","serving_id":"5943","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=5943&portionamount=1.000","sodium":"438","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"57","calories":"276","carbohydrate":"0","cholesterol":"186","fat":"11.09","fiber":"0","iron":"3.51","measurement_description":"medium neck (from 14 to 18 lb turkey)","metric_serving_amount":"154.000","metric_serving_unit":"g","monounsaturated_fat":"2.520","number_of_units":"1.000","polyunsaturated_fat":"3.329","potassium":"228","protein":"41.00","saturated_fat":"3.726","serving_description":"1 medium (from 14 to 18 lb turkey)","serving_id":"5996","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=5996&portionamount=1.000","sodium":"582","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"71","calories":"345","carbohydrate":"0","cholesterol":"234","fat":"13.90","fiber":"0","iron":"4.40","measurement_description":"large neck (from 19 to 21 lb turkey)","metric_serving_amount":"193.000","metric_serving_unit":"g","monounsaturated_fat":"3.158","number_of_units":"1.000","polyunsaturated_fat":"4.172","potassium":"286","protein":"51.38","saturated_fat":"4.670","serving_description":"1 large (from 19 to 21 lb turkey)","serving_id":"7106","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=7106&portionamount=1.000","sodium":"730","sugar":"0","vitamin_a":"0","vitamin_c":"0"},{"calcium":"37","calories":"179","carbohydrate":"0","cholesterol":"121","fat":"7.20","fiber":"0","iron":"2.28","measurement_description":"g","metric_serving_amount":"100.000","metric_serving_unit":"g","monounsaturated_fat":"1.636","number_of_units":"100.000","polyunsaturated_fat":"2.162","potassium":"148","protein":"26.62","saturated_fat":"2.420","serving_description":"100 g","serving_id":"50456","serving_url":"https://www.fatsecret.com/calories-nutrition/generic/turkey-neck-cooked?portionid=50456&portionamount=100.000","sodium":"378","sugar":"0","vitamin_a":"0","vitamin_c":"0"}]}}`)
  console.log(convertFsToFoodItem(slicedTurkey))
  
  //const slicedTurkey = JSON.parse(`{"brand_name":"Whole Foods Market","food_id":"23132229","food_name":"Plain Roasted Turkey Breast","food_type":"Brand","food_url":"https://www.fatsecret.com/calories-nutrition/whole-foods-market/plain-roasted-turkey-breast","servings":{"serving":[{"calories":"100","carbohydrate":"0","cholesterol":"50","fat":"1.00","fiber":"0","measurement_description":"serving","metric_serving_amount":"3.000","metric_serving_unit":"oz","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0","potassium":"0","protein":"19.00","saturated_fat":"0","serving_description":"1 serving","serving_id":"21634552","serving_url":"https://www.fatsecret.com/calories-nutrition/whole-foods-market/plain-roasted-turkey-breast","sodium":"300","sugar":"0","trans_fat":"0"}]}}`)
  //console.log(convertFsToFoodItem(slicedTurkey))
  //console.dir(result[0], { depth: null })
  //console.log(convertFsToFoodItem(result[0]))
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
