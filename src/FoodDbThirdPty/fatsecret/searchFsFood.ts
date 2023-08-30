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
  try {
    token = await getFsAccessToken();
  } catch (error) {
    //curl -u YOUR_CLIENT_ID:YOUR_CLIENT_SECRET -d "grant_type=client_credentials&scope=premier" -X POST https://oauth.fatsecret.com/connect/token -H "Content-Type: application/x-www-form-urlencoded"
    token = `eyJhbGciOiJSUzI1NiIsImtpZCI6IjVGQUQ4RTE5MjMwOURFRUJCNzBCMzU5M0E2MDU3OUFEMUM5NjgzNDkiLCJ0eXAiOiJhdCtqd3QiLCJ4NXQiOiJYNjJPR1NNSjN1dTNDeldUcGdWNXJSeVdnMGsifQ.eyJuYmYiOjE2OTM0MDY5OTksImV4cCI6MTY5MzQ5MzM5OSwiaXNzIjoiaHR0cHM6Ly9vYXV0aC5mYXRzZWNyZXQuY29tIiwiYXVkIjoicHJlbWllciIsImNsaWVudF9pZCI6ImY2YzdiZWM4NDA2YjRjODVhYjUwNDNkNjhkYmIxMjM3Iiwic2NvcGUiOlsicHJlbWllciJdfQ.PfD6L5qlAuVpZCpuDTRossUZcQ4EL2fQNTqqw_Nxvf-Lo0v3ARn0jaF3PWP4Wq85SMkjwaihdsqAJE5AApQdoZXvU1XQym89XMxJ_aNcoirUZrGB96xvdKV6KKQ7-LN7ig-aaVdnzaYmn6rE0AK74oO7Pm87CLmtH7mvmAlGUMq1Z6zukIW-g2idkz-xEIPZQoaJwZfPd6qOKBJ7O4u9TUte4D2s2CWOXwIvqmbjzwFRXf5MKK2sg4fU8lhIfRcSUuwMyf17MHDrw_U0FODVfh0ZtSlQgEtrq1fMjuH4AlZbRwTvcNPhlI4Pgw_rBnM-lNFdTD-88FHzEbI3IDqkRg`
  }
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
