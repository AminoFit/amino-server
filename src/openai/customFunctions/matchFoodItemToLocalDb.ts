import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { chatCompletion, chatCompletionInstruct, correctAndParseResponse } from "./chatCompletion"
import OpenAI from "openai"
import { User } from "@prisma/client"
import { FoodItemIdAndEmbedding } from "../../database/OpenAiFunctions/utils/foodLoggingTypes";
import { FoodEmbeddingCache } from "../../utils/foodEmbedding";
import { checkCompliesWithSchema } from "../utils/openAiHelper"

/**
 * Discriminative Food Item Matcher
 * 
 * Purpose:
 * - This function is tailored to match a user request to a specific food item in our database.
 * - It is more discriminative compared to the `matchFoodItemToDb` function.
 * 
 * Distinctions:
 * - `matchFoodItemToDb` is used for gathering items from a list of external databases.
 * - This function targets items exclusively in our own database.
 * 
 * Rationale:
 * - Given the smaller size of our database, it's essential to determine when to invoke external database searches.
 * - If no match is found internally, an external database search is triggered.
 */


const matchFoodItemToDatatbaseSchema = {
  type: "object",
  properties: {
    closest_food_id: { type: "number" },
    good_match_found: { type: "boolean" },
    user_request_to_closest_food_similarity_0_to_1: { type: "number" }
  },
  required: ["closest_food_id", "good_match_found", "user_request_to_closest_food_id_food_similarity_0_to_1"]
}

interface MatchRequest {
  user_request: {
    food_name: string
    brand?: string
  }
  database: {
    food_id: number
    food_name: string
    brand?: string
  }[]
}

function convertToMatchRequest(
  user_request: FoodItemToLog,
  database_options: FoodItemIdAndEmbedding[]
): MatchRequest {
  const defaultFoodItem = {
    food_id: 0,
    food_name: "None of the below",
    brand: undefined
  }

  const database = database_options.map((option, index) => ({
    food_id: index + 1,
    food_name: option.name,
    brand: option.brand
  }))

  return {
    user_request: {
      food_name: user_request.food_database_search_name,
      brand: user_request.brand
    },
    database: [defaultFoodItem, ...database]
  }
}

export async function findBestFoodMatchtoLocalDb(
    database_options: FoodItemIdAndEmbedding[],
    user_request: FoodItemToLog,
    user_query_vector_cache: FoodEmbeddingCache,
    message_id: number,
    user: User
  ): Promise<FoodItemIdAndEmbedding | null> {
  const matchRequest = convertToMatchRequest(user_request, database_options)
  console.log(JSON.stringify(matchRequest))

  let model = "gpt-3.5-turbo-instruct-0914"
  let max_tokens = 250
  let temperature = 0
  let prompt = `Based on the user request and the database items match the user request to the output. Be harsh on matching since there are many food items with similar names.
${JSON.stringify(matchRequest)}

Match output format:
{ best_match_in_db_item_id: int
user_request_to_db_is_the_same: bool,
user_request_to_db_similarity: number(0,1)
}

Output: 
{`.trim()

  try {
    let result = await chatCompletionInstruct(
      {
        prompt: prompt.trim(),
        model: model,
        temperature: temperature,
        max_tokens: max_tokens,
        stop: "}"
      },
      user
    )

    let response = correctAndParseResponse("{"+result.text!.trim() + "}")

    if (response.best_match_in_db_item_id < 0 || response.best_match_in_db_item_id > database_options.length) {
      console.log("Invalid food item, retrying with GPT-4")
      const system =
        "Call match_user_request_to_database. Think carefully before replying and consider all food options before concluding. There are trick questions so be sure to consider the options at the end."
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(matchRequest) }
      ]
      model = "gpt-4-0613"
      let result = await chatCompletion(
        {
          messages,
          functions: [
            {
              name: "match_user_request_to_database",
              description:
                "This function attempts to match user_request to a database entry. For user_request_to_closest_food_similarity_0_to_1 0 is a bad match, 0.5 is a similar match with issues like brand and 1 is a perfect match.",
              parameters: matchFoodItemToDatatbaseSchema
            }
          ],
          model,
          temperature,
          max_tokens
        },
        user
      )
      if (result.function_call && result.function_call.name === "match_user_request_to_database") {
        response = JSON.parse(result.function_call!.arguments!)
      } else {
        throw new Error("Failed to get a valid response from GPT-4")
      }
    }

    // If no valid match is found, return null
    if (
      response.best_match_in_db_item_id === 0 ||
      !response.user_request_to_db_is_the_same ||
      response.user_request_to_db_similarity < 0.8
    ) {
      return null
    }
    // Fetch the matched food item from database_options
    const matchedFood = database_options[response.closest_food_id - 1]
    return matchedFood
  } catch (error) {
    console.log(error)
    return null
  }
}

function testMatching(){
    const topMatches = [
        {"id":7,"name":"Protein Bar, Strawberry","brand":"RxBar","embedding":"[]","cosine_similarity":0.88},
        {"id":10,"name":"Protein Bar, Banana","brand":"RxBar","embedding":"[]","cosine_similarity":0.88},
        {"id":11,"name":"Veggie Chips","brand":"Healthies","embedding":"[]","cosine_similarity":0.86},
        {"id":12,"name":"Chocolate Chip Cookies","brand":"SweetTooth","embedding":"[]","cosine_similarity":0.87},
        {"id":13,"name":"Vanilla Ice Cream","brand":"ColdDelights","embedding":"[]","cosine_similarity":0.85},
        {"id":14,"name":"Beef Jerky, Original","brand":"SnackKing","embedding":"[]","cosine_similarity":0.82},
        {"id":15,"name":"Almond Butter","brand":"NuttySpread","embedding":"[]","cosine_similarity":0.88},
        {"id":16,"name":"Organic Granola Bar, Blueberry","brand":"NatureTreats","embedding":"[]","cosine_similarity":0.89},
        {"id":17,"name":"Sparkling Water, Lime","brand":"ClearFizz","embedding":"[]","cosine_similarity":0.81},
      ];
    const food = {"brand":"RXBAR","branded":true,"serving":{"serving_name":"bar","serving_amount":1,"serving_g_or_ml":"g","total_serving_g_or_ml":52},"food_database_search_name":"Strawberry RXBAR"}
    const userQueryVectorCache = {"search_string":"strawberry rxbar","embedding_cache_id":31,"bge_base_embedding":[]}
    const messageId = 84
    const user = {"id":"clklnwf090000lzssqhgfm8kr","firstName":"Sebastian","lastName":"","email":"seb.grubb@gmail.com","emailVerified":new Date("2023-10-09T22:45:35.771Z"),"phone":"+16503079963","dateOfBirth":new Date("1992-05-06T04:00:00.000Z"),"weightKg":75,"heightCm":175,"calorieGoal":2440,"proteinGoal":200,"carbsGoal":230,"fatGoal":80,"fitnessGoal":"Lose weight","unitPreference":"METRIC","setupCompleted":false,"sentContact":true,"sendCheckins":false,"tzIdentifier":"America/New_York"} as User
    findBestFoodMatchtoLocalDb(topMatches, food as FoodItemToLog, userQueryVectorCache, messageId, user)
}

testMatching()
