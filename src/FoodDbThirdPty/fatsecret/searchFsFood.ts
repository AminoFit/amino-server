import axios from "axios"
import { getFsAccessToken } from "./oauthFs"
import { FsFoodInfo } from "./fsInterfaceHelper"

export interface FatSecretFindFoodParams {
  search_expression: string
  page_number?: number
  max_results?: number
  include_sub_categories?: boolean
  flag_default_serving?: boolean
}

export async function findFatSecretFoodInfo(
  searchParams: FatSecretFindFoodParams
): Promise<FsFoodInfo[] | any> {

  console.log("Searching FatSecret for", searchParams.search_expression)
  let token;
  token = await getFsAccessToken();
  if (!token) return null;

  const url = "https://platform.fatsecret.com/rest/server.api"; 

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded", 
    "Authorization": `Bearer ${token}`
  };

  const params: { [key: string]: any } = {
    method: "foods.search.v2",
    format: "json",
    ...searchParams,
    max_results: searchParams.max_results || 10
  };

  // Manually constructing the query string
  const paramsString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  try {
    const response = await axios.post(url, paramsString, { headers });
    if (
      response.data &&
      response.data.foods_search &&
      response.data.foods_search.results
    ) {
      return response.data.foods_search.results.food as FsFoodInfo[];
    }
    console.log(response)
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/*
async function runTest() {
  const searchParams: FatSecretFindFoodParams = { search_expression: "Starbucks Ice latte" }
  const result: FsFoodInfo[] = await findFatSecretFoodInfo(searchParams)
  console.log(JSON.stringify(result))
}*/

// runTest()
