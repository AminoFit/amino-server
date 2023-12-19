import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import OpenAI from "openai"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { chatCompletion, chatCompletionInstruct, correctAndParseResponse } from "./chatCompletion"
import { Tables } from "types/supabase"

const matchFoodItemsToDatabaseFunctionDescription =
  "This function attempts to match user_request to a database entry. For user_request_to_closest_food_similarity_0_to_1 0 is a bad match, 0.5 is a similar match with issues like brand and 1 is a perfect match."

const matchFoodItemsToDatabaseFunctionSchema = {
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
  database_options: foodSearchResultsWithSimilarityAndEmbedding[]
): MatchRequest {
  const defaultFoodItem = {
    food_id: 0,
    food_name: "None of the below",
    brand: undefined
  }

  const database = database_options.map((option, index) => ({
    food_id: index + 1,
    food_name: option.foodName,
    brand: option.foodBrand
  }))

  return {
    user_request: {
      food_name: user_request.food_database_search_name,
      brand: user_request.brand
    },
    database: [defaultFoodItem, ...database]
  }
}

export async function findBestFoodMatchExternalDb(
  user: Tables<"User">,
  user_request: FoodItemToLog,
  database_options: foodSearchResultsWithSimilarityAndEmbedding[]
): Promise<foodSearchResultsWithSimilarityAndEmbedding | null> {
  const matchRequest = convertToMatchRequest(user_request, database_options)
  //console.log(JSON.stringify(matchRequest))

  let model = "gpt-3.5-turbo-instruct-0914"
  let max_tokens = 250
  let temperature = 0
  let prompt =
    `Match user_request to the best food_id in the below. If no good matches output 0.:\nMATCH_REQUEST_HERE\nOnly give me an answer in this form:
{ closest_food_id: int,
good_match_found: bool,
user_request_to_closest_food_similarity_0_to_1: number}`
      .trim()
      .replace("MATCH_REQUEST_HERE", JSON.stringify(matchRequest))

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

    let response = correctAndParseResponse(result.text!.trim() + "}")

    if (response.closest_food_id < 0 || response.closest_food_id > database_options.length) {
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
              description: matchFoodItemsToDatabaseFunctionDescription,
              parameters: matchFoodItemsToDatabaseFunctionSchema
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
      response.closest_food_id === 0 ||
      !response.good_match_found ||
      response.user_request_to_closest_food_similarity_0_to_1 < 0.8
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

async function testFindBestFoodMatch() {
  const food_item_to_log: FoodItemToLog = {
    food_database_search_name: "hydro whey protein shake",
    full_item_user_message_including_serving: "1 scoop of hydro whey protein shake",
    brand: "optimum nutrition",
    branded: true,
    serving: { serving_amount: 1, serving_name: "scoop", serving_g_or_ml: "g", total_serving_g_or_ml: 39 }
  }
  const foodSearchResults: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.8752489067563187,
      foodSource: "USDA",
      foodName: "Platinum Whey",
      foodBrand: "Optimum Nutrition"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.8563104753793219,
      foodSource: "USDA",
      foodName: "Hydro Whey Protein Powder Drink Mix, Velocity Vanilla",
      foodBrand: "ON Optimum Nutrition"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.8545991597715571,
      foodSource: "USDA",
      foodName: "Platinum Hydro Whey Protein Powder Drink Mix",
      foodBrand: "Optimum Nutrition"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.7808359526591413,
      foodSource: "USDA",
      foodName: "Gold Standard Protein Shake, Gold Standard",
      foodBrand: "Optimum Nutrition"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.7693964701531227,
      foodSource: "USDA",
      foodName: "Natural Protein Shake",
      foodBrand: "Designer Whey"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.7658497095108032,
      foodSource: "USDA",
      foodName: "Gold Standard Protein Shake, Vanilla, Vanilla",
      foodBrand: "Optimum Nutrition"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.7636003494262695,
      foodSource: "USDA",
      foodName: "Protein Shake",
      foodBrand: "Designer Protein"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.7629784345626831,
      foodSource: "USDA",
      foodName: "High Protein Shake",
      foodBrand: "Premier Protein"
    }
  ]
  const user: Tables<"User"> = {
    id: "clmzqmr2a0000la08ynm5rjju",
    fullName: "John",
    email: "john.doe@example.com",
    phone: "123-456-7890",
    weightKg: 70.5,
    heightCm: 180,
    calorieGoal: 2000,
    proteinGoal: 100,
    carbsGoal: 200,
    fatGoal: 50,
    fitnessGoal: "Maintain",
    unitPreference: "IMPERIAL",
    setupCompleted: false,
    sentContact: false,
    sendCheckins: false,
    tzIdentifier: "America/New_York",
    avatarUrl: null,
    dateOfBirth: null,
    emailVerified: null,
    activityLevel: null
  }
  const food_item_to_log_1: FoodItemToLog = {
    full_item_user_message_including_serving: "1 can of Pop",
    food_database_search_name: "Pop",
    brand: "PepsiCo",
    branded: true,
    serving: { serving_amount: 1, serving_name: "can", serving_g_or_ml: "g", total_serving_g_or_ml: 355 }
  }

  const foodSearchResults_1: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.5,
      foodSource: "USDA",
      foodName: "Fizzy Soda",
      foodBrand: "Coca-Cola"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.85,
      foodSource: "USDA",
      foodName: "Carbonated Beverage",
      foodBrand: "Pepsi"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.8,
      foodSource: "USDA",
      foodName: "Cola Soft Drink",
      foodBrand: "Dr Pepper"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.78,
      foodSource: "USDA",
      foodName: "Sugary Liquid Refreshment",
      foodBrand: "Sprite"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.72,
      foodSource: "USDA",
      foodName: "Sparkling Drink",
      foodBrand: "7UP"
    }
  ]
  const food_item_to_log_2: FoodItemToLog = {
    food_database_search_name: "Beef Burger Patty",
    full_item_user_message_including_serving: "1 patty of Beef Burger Patty",
    brand: "Beyond Meat",
    branded: true,
    serving: { serving_amount: 1, serving_name: "patty", serving_g_or_ml: "g", total_serving_g_or_ml: 113 }
  }

  const foodSearchResults_2: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.9,
      foodSource: "USDA",
      foodName: "Chicken Burger Patty",
      foodBrand: "Real Meat Co."
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.88,
      foodSource: "USDA",
      foodName: "Vegetable Patty",
      foodBrand: "Veggie Delight"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.82,
      foodSource: "USDA",
      foodName: "Plant-Based Burger",
      foodBrand: "Beyond Delicious"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.81,
      foodSource: "USDA",
      foodName: "Beef Alternative Patty",
      foodBrand: "Impossible Foods"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.79,
      foodSource: "USDA",
      foodName: "Vegan Burger",
      foodBrand: "Healthy Choices"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.82,
      foodSource: "USDA",
      foodName: "Plant-Based Burger",
      foodBrand: "Beyond Meat"
    }
  ]
  const food_item_to_log_3: FoodItemToLog = {
    food_database_search_name: "Raspberry Yogurt",
    full_item_user_message_including_serving: "1 cup of Raspberry Yogurt",
    brand: "Yummy Dairy",
    branded: true,
    serving: { serving_amount: 1, serving_name: "cup", serving_g_or_ml: "g", total_serving_g_or_ml: 200 }
  }

  const foodSearchResults_3: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.88,
      foodSource: "USDA",
      foodName: "Strawberry Yogurt",
      foodBrand: "Dairy King"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.86,
      foodSource: "USDA",
      foodName: "Blueberry Yogurt",
      foodBrand: "Fresh Dairy Co."
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.84,
      foodSource: "USDA",
      foodName: "Mixed Berry Yogurt",
      foodBrand: "MooMoo Farms"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.82,
      foodSource: "USDA",
      foodName: "Raspberry-Flavored Yogurt",
      foodBrand: "Yum Dairy"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.79,
      foodSource: "USDA",
      foodName: "Cherry Yogurt",
      foodBrand: "Dairy Fresh"
    }
  ]
  const food_item_to_log_4: FoodItemToLog = {
    food_database_search_name: "Mangosteen",
    full_item_user_message_including_serving: "1 fruit of Mangosteen",
    brand: "Exotic Fruits Co.",
    branded: true,
    serving: { serving_amount: 1, serving_name: "fruit", serving_g_or_ml: "g", total_serving_g_or_ml: 50 }
  }

  const foodSearchResults_4: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.5,
      foodSource: "USDA",
      foodName: "Mango",
      foodBrand: "Tropical Fruits Inc."
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.4,
      foodSource: "USDA",
      foodName: "Pineapple",
      foodBrand: "Island Fruits Ltd."
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.3,
      foodSource: "USDA",
      foodName: "Dragonfruit",
      foodBrand: "Tropical Fruits Co."
    }
  ]
  const food_item_to_log_5: FoodItemToLog = {
    food_database_search_name: "Kombucha Ginger Lime",
    full_item_user_message_including_serving: "1 bottle of Kombucha Ginger Lime",
    brand: "Artisan Brews",
    branded: true,
    serving: { serving_amount: 1, serving_name: "bottle", serving_g_or_ml: "g", total_serving_g_or_ml: 240 }
  }

  const foodSearchResults_5: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.5,
      foodSource: "USDA",
      foodName: "Green Tea",
      foodBrand: "Leafy Brands"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.45,
      foodSource: "USDA",
      foodName: "Kombucha Classic",
      foodBrand: "Ferment Delights"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.45,
      foodSource: "USDA",
      foodName: "Kombucha Pineapple",
      foodBrand: "Wild West Bootles"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.4,
      foodSource: "USDA",
      foodName: "Lemon Iced Tea",
      foodBrand: "Thirst Quenchers"
    },

    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.4,
      foodSource: "USDA",
      foodName: "Ginger Kombucha",
      foodBrand: "Artisan Brews"
    }
  ]
  const food_item_to_log_6: FoodItemToLog = {
    food_database_search_name: "Chocolate Lava Cake with Caramel Core",
    full_item_user_message_including_serving: "1 slice of Chocolate Lava Cake with Caramel Core",
    brand: "Dessert Heaven",
    branded: true,
    serving: { serving_amount: 1, serving_name: "slice", serving_g_or_ml: "g", total_serving_g_or_ml: 120 }
  }

  const foodSearchResults_6: foodSearchResultsWithSimilarityAndEmbedding[] = [
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.6,
      foodSource: "USDA",
      foodName: "Chocolate Cake",
      foodBrand: "Cocoa Delights"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.55,
      foodSource: "USDA",
      foodName: "Vanilla Lava Cake",
      foodBrand: "Sweet Indulgences"
    },
    {
      foodBgeBaseEmbedding: [],
      similarityToQuery: 0.5,
      foodSource: "USDA",
      foodName: "Caramel Cake",
      foodBrand: "Golden Desserts"
    }
  ]

  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log, foodSearchResults))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_1, foodSearchResults_1))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_2, foodSearchResults_2))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_3, foodSearchResults_3))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_4, foodSearchResults_4))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_5, foodSearchResults_5))
  console.log(await findBestFoodMatchExternalDb(user, food_item_to_log_6, foodSearchResults_6))
}

//testFindBestFoodMatch()
