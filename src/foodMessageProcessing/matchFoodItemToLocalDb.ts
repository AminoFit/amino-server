import { FoodItemToLog } from "../utils/loggedFoodItemInterface"
import { chatCompletion, chatCompletionInstruct, correctAndParseResponse } from "../languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"
import { FoodItemIdAndEmbedding } from "../database/OpenAiFunctions/utils/foodLoggingTypes"
import { FoodEmbeddingCache } from "../utils/foodEmbedding"
import { checkCompliesWithSchema } from "../languageModelProviders/openai/utils/openAiHelper"
import { Tables } from "types/supabase"

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

const matchUserRequestToDatabaseSchema = {
  type: "object",
  properties: {
    best_match_in_db_item_id: { type: "number" },
    user_request_to_db_is_the_same: { type: "boolean" },
    user_request_to_db_similarity: { type: "number" }
  },
  required: ["best_match_in_db_item_id", "user_request_to_db_is_the_same", "user_request_to_db_similarity"]
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

function convertToMatchRequest(user_request: FoodItemToLog, database_options: FoodItemIdAndEmbedding[]): MatchRequest {
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
  user: Tables<"User">
): Promise<FoodItemIdAndEmbedding | null> {
  const matchRequest = convertToMatchRequest(user_request, database_options)

  let model = "gpt-3.5-turbo-instruct-0914"
  let max_tokens = 250
  let temperature = 0
  let prompt =
    `Based on the user request and the database items match the user request to the output. Be harsh on matching since there are many food items with similar names.
${JSON.stringify(matchRequest)}

Match output format:
{ best_match_in_db_item_id: int,
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

    let response = correctAndParseResponse("{" + result.text!.trim() + "}")

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
                "This function attempts to match the user request to the output from the database. It is strict in matching since many food items have similar names. For user_request_to_db_similarity, 0 indicates a bad match, 0.5 represents a similar match with some differences, and 1 denotes a perfect match.",
              parameters: matchUserRequestToDatabaseSchema
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
        console.log("GPT-4 response:", response)
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
    const matchedFood = database_options[response.best_match_in_db_item_id - 1]
    return matchedFood
  } catch (error) {
    console.log(error)
    return null
  }
}

function testMatching() {
  const topMatches = [
    { id: 7, name: "Protein Bar, Strawberry", brand: "RxBar", embedding: "[]", cosine_similarity: 0.88 },
    { id: 10, name: "Protein Bar, Banana", brand: "RxBar", embedding: "[]", cosine_similarity: 0.88 },
    { id: 11, name: "Veggie Chips", brand: "Healthies", embedding: "[]", cosine_similarity: 0.86 },
    { id: 12, name: "Chocolate Chip Cookies", brand: "SweetTooth", embedding: "[]", cosine_similarity: 0.87 },
    { id: 13, name: "Vanilla Ice Cream", brand: "ColdDelights", embedding: "[]", cosine_similarity: 0.85 },
    { id: 14, name: "Beef Jerky, Original", brand: "SnackKing", embedding: "[]", cosine_similarity: 0.82 },
    { id: 15, name: "Almond Butter", brand: "NuttySpread", embedding: "[]", cosine_similarity: 0.88 },
    { id: 16, name: "Organic Granola Bar, Blueberry", brand: "NatureTreats", embedding: "[]", cosine_similarity: 0.89 },
    { id: 17, name: "Sparkling Water, Lime", brand: "ClearFizz", embedding: "[]", cosine_similarity: 0.81 }
  ]
  const food = {
    brand: "RXBAR",
    branded: true,
    serving: { serving_name: "bar", serving_amount: 1, serving_g_or_ml: "g", total_serving_g_or_ml: 52 },
    food_database_search_name: "Strawberry RXBAR"
  }
  const userQueryVectorCache = { search_string: "strawberry rxbar", embedding_cache_id: 31, bge_base_embedding: [] }
  const messageId = 84
  const user = {
    id: "clklnwf090000lzssqhgfm8kr",
    fullName: "Sebastian",
    email: "seb.grubb@gmail.com",
    phone: "+16503079963",
    dateOfBirth: new Date("1992-05-06T04:00:00.000Z").toISOString(),
    weightKg: 75,
    heightCm: 175,
    calorieGoal: 2440,
    proteinGoal: 200,
    carbsGoal: 230,
    fatGoal: 80,
    fitnessGoal: "Lose weight",
    unitPreference: "METRIC",
    setupCompleted: false,
    sentContact: true,
    sendCheckins: false,
    tzIdentifier: "America/New_York"
  } as Tables<"User">
  findBestFoodMatchtoLocalDb(topMatches, food as FoodItemToLog, userQueryVectorCache, messageId, user)
}

//testMatching()

async function testMatchingFunctionality() {
  const user = {
    id: "clklnwf090000lzssqhgfm8kr"
  } as Tables<"User">
  const messageId = 84
  const testCases = [
    {
      food: {
        brand: "rx bar",
        branded: true,
        serving: { serving_name: "bar", serving_amount: 1, serving_g_or_ml: "g", total_serving_g_or_ml: 50 },
        food_database_search_name: "protein strawberry bar"
      },
      userQuery: { search_string: "protein strawberry bar by rx bar", embedding_cache_id: 32, bge_base_embedding: [] },
      expectedResult: true
    },
    {
      food: {
        brand: "ColdDelights",
        branded: true,
        serving: { serving_name: "scoop", serving_amount: 1, serving_g_or_ml: "g", total_serving_g_or_ml: 60 },
        food_database_search_name: "vanilla ice delight"
      },
      userQuery: {
        search_string: "vanilla ice delight by ColdDelights",
        embedding_cache_id: 33,
        bge_base_embedding: []
      },
      expectedResult: true
    },
    {
      food: {
        brand: "RxBar",
        branded: true,
        serving: { serving_name: "jar", serving_amount: 1, serving_g_or_ml: "g", total_serving_g_or_ml: 30 },
        food_database_search_name: "banana almond delight"
      },
      userQuery: { search_string: "banana almond delight by RxBar", embedding_cache_id: 34, bge_base_embedding: [] },
      expectedResult: false
    },
    {
      food: {
        brand: "ClearFizz",
        branded: true,
        serving: { serving_name: "bottle", serving_amount: 1, serving_g_or_ml: "g", total_serving_g_or_ml: 40 },
        food_database_search_name: "sparkling lemonade"
      },
      userQuery: { search_string: "sparkling lemonade by ClearFizz", embedding_cache_id: 35, bge_base_embedding: [] },
      expectedResult: false
    }
  ]
  const topMatches = [
    { id: 7, name: "Protein Bar, Strawberry", brand: "RxBar", embedding: "[]", cosine_similarity: 0.88 },
    { id: 10, name: "Protein Bar, Banana", brand: "RxBar", embedding: "[]", cosine_similarity: 0.88 },
    { id: 11, name: "Veggie Chips", brand: "Healthies", embedding: "[]", cosine_similarity: 0.86 },
    { id: 12, name: "Chocolate Chip Cookies", brand: "SweetTooth", embedding: "[]", cosine_similarity: 0.87 },
    { id: 13, name: "Vanilla Ice Cream", brand: "ColdDelights", embedding: "[]", cosine_similarity: 0.85 },
    { id: 14, name: "Beef Jerky, Original", brand: "SnackKing", embedding: "[]", cosine_similarity: 0.82 },
    { id: 15, name: "Almond Butter", brand: "NuttySpread", embedding: "[]", cosine_similarity: 0.88 },
    { id: 16, name: "Organic Granola Bar, Blueberry", brand: "NatureTreats", embedding: "[]", cosine_similarity: 0.89 },
    { id: 17, name: "Sparkling Water, Lime", brand: "ClearFizz", embedding: "[]", cosine_similarity: 0.81 }
  ]

  let passedCount = 0

  for (let i = 0; i < testCases.length; i++) {
    //for (let i = 0; i < 1; i++) {
    const result = await findBestFoodMatchtoLocalDb(
      topMatches,
      testCases[i].food as FoodItemToLog,
      testCases[i].userQuery,
      messageId,
      user
    )
    //console.log(result)
    if ((result && testCases[i].expectedResult) || (!result && !testCases[i].expectedResult)) {
      passedCount++
      console.log(`Test case ${i + 1} passed.`)
    } else {
      console.log(`Test case ${i + 1} failed.`)
      console.log(`Expected: ${testCases[i].expectedResult ? "Match" : "No Match"}`)
      console.log(`Received: ${result ? "Match" : "No Match"}`)
      console.log(`Food Item: ${testCases[i].food.food_database_search_name}`)
      console.log("-------------------")
    }
  }

  console.log(`${passedCount} out of ${testCases.length} tests passed.`)
}

//testMatchingFunctionality()
