import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import {
  chatCompletion
} from "../../languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"
import { FoodItemIdAndEmbedding } from "../../database/OpenAiFunctions/utils/foodLoggingTypes"
import { FoodEmbeddingCache } from "../../utils/foodEmbedding"
import { checkCompliesWithSchema } from "../../languageModelProviders/openai/utils/openAiHelper"
import { Tables } from "types/supabase"
import { extractAndParseLastJSON } from "../common/extractJSON"

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

const matchSystemPrompt = `You are a helpful food matching assistant that precisely and accurately matches user logged foods to database entries. You only match if the food is clearly the same otherwise you refuse to match and continue searching online. You always finish with an output in perfect JSON.`

const matchUserRequestPrompt = `user_food_logged:
"LOGGED_FOOD_NAME"

IMPORTANT: assume the most common preparation if user has not specified.

database_search_results:
DATABASE_SEARCH_RESULTS


GOAL:
We want to accurately and precisely match user_food_logged to the results in database_search_results if correct matches exist. If the entries don't overlap we can instead opt to continue searching. You do this by setting "no_good_matches" to true.

IMPORTANT: If the user specifies a preparation  we must match with that. If they don't specify some details we can match with the most common options. DO NOT ASSUME ANYTHING ABOUT THE DATABASE RESULTS.

READ AND FOLLOW THESE STEPS:
1. Look at user_food_logged and make any reasonable assumptions about what they ate. (e.g. "milk" could mean "whole milk" or "fat free milk")

2. See if there are exact matches in database_search_results based on user constraints (e.g. if they said "Lindt Chocolate" then we must match with Lindt branded chocolate. )

3. Make sure we are matching for EVERYTHING the user meant and not something that has similar words. e.g. if they said "Apple" you CANNOT match with items in database_search_results such as "Apple Juice", "Apple Pie", "Apple Crumble" since the user clearly meant a plain apple. Matching "Apple" to "Royal Gala" is fine.

3a. The match must be comprehensive. For example "bread with brie" cannot match "bread" alone. You may do this but must then set extra_item_name to the unmatched food components.

4. Output the final assessment in a valid JSON format:
{
  "no_good_matches": "boolean",
  "best_food_match_id": "number | null",
  "alternative_match_id": "number | null",
  "extra_item_name": "string | null?"
}

no_good_matches(bool) - is true if we think there will be a better match if we continue searching online. 

best_food_match_id(int|null) - is null if there is no good food match otherwise it is a single integer referring to one of the items in database_search_results. 

alternative_match_id(int|null) - contains the id of a second potential match the user may have wanted that is different from best_food_match_id (e.g. if best_food_match_id is 'unsalted butter' then alternative_match_id can't be 'butter no salt' but could be say 'salted butter' if user just said "butter")

extra_item_name?(string|null): Only include this if not null as it is optional. Use this when half the request has a good match but is missing the rest. Like "honey with yogurt". if best_food_match_id refers to honey then set extra_unmatched_item_name to "yogurt". When this option is used, no_good_matches must be false (i.e. a good match was found).

OUTPUT INSTRUCTIONS :

1. Reasoning should follow these steps:
Think what the user_food_logged means based on common sense. Then compare it options in database_search_results to select a best_food_match_id if there is a an accurate and precise match.

2. Set no_good_matches  to true if we have nutritional differences between user_food_logged and the matched item from database_search_results. (for example if  they are different preparations do not match, like "milk" cannot match with "milk powder")

3. Confirm that the two items are indeed the same in terms of preparation, nutrition and variations (if user says strawberry yogurt we cannot match with plain yogurt). YOU MUST DO THIS BEFORE DECIDING IF TO MATCH OR NOT.

4. Finish with a valid JSON.`

type DatabaseItem = {
  id: number
  name: string
  brand: string
}

type ConversionResult = {
  databaseOptionsString: string
  idMapping: Record<number, number>
}

const convertToDatabaseOptions = (foodItems: FoodItemIdAndEmbedding[]): ConversionResult => {
  const databaseOptions: DatabaseItem[] = foodItems.map((item, index) => ({
    id: index + 1,  // Maintain this for internal reference
    name: item.name,
    brand: item.brand
  }));

  const idMapping: Record<string, number> = {}; // Change to string to accommodate compound keys

  foodItems.forEach((item, index) => {
    if (item.id !== undefined) {
      idMapping[item.id.toString()] = index + 1;
    } else if (item.externalId !== undefined && item.foodInfoSource !== undefined) {
      // Use a compound key of source and externalId
      const compoundKey = `${item.foodInfoSource}:${item.externalId}`;
      idMapping[compoundKey] = index + 1;
      // console.log(`item has no id, using externalId from ${item.foodInfoSource}`, item);
    } else {
      // console.log("item has no id or external ID", item);
    }
  });

  const databaseOptionsString = databaseOptions.map(item => JSON.stringify(item)).join("\n");

  return { databaseOptionsString, idMapping };
};

function parseIfNumeric(id: string): number | string {
  return /^[0-9]+$/.test(id) ? parseInt(id) : id;
}

const remapIds = (match: DatabaseMatch, mapping: Record<string, number>): DatabaseMatch => {
  const remappedMatch = { ...match };

  // Find the original ID for the best match using the helper to determine if it should be an int
  const originalIdForBestMatch = Object.keys(mapping).find(
    (key) => mapping[key] === match.best_food_match_id
  );

  // Find the original ID for the alternative match using the helper to determine if it should be an int
  const originalIdForAlternativeMatch = Object.keys(mapping).find(
    (key) => mapping[key] === match.alternative_match_id
  );

  // Cast numeric string to integer if appropriate, otherwise leave as string
  remappedMatch.best_food_match_id = originalIdForBestMatch ? parseIfNumeric(originalIdForBestMatch) : null;
  remappedMatch.alternative_match_id = originalIdForAlternativeMatch ? parseIfNumeric(originalIdForAlternativeMatch) : null;

  return remappedMatch;
};

interface DatabaseMatch {
  no_good_matches: boolean;
  best_food_match_id?: number | string | null;
  alternative_match_id?: number | string | null;
  extra_item_name?: string | null;
}


function findMatchingItem(databaseOptions: FoodItemIdAndEmbedding[], matchId: string | number | null | undefined): FoodItemIdAndEmbedding | null {
  if (matchId === null) return null;

  let source: string | null = null;
  let externalId: string | null = null;
  if (typeof matchId === 'string' && matchId.includes(':')) {
    [source, externalId] = matchId.split(':');
    return databaseOptions.find(item => item.foodInfoSource === source && item.externalId === externalId) || null;
  } else {
    return databaseOptions.find(item => item.id === matchId) || null;
  }
}


export async function findBestFoodMatchtoLocalDb(
  database_options: FoodItemIdAndEmbedding[],
  user_request: FoodItemToLog,
  user: Tables<"User">
  ): Promise<[FoodItemIdAndEmbedding | null, FoodItemIdAndEmbedding | null]> {
    const foodToMatch = (user_request.brand ? ` - ${user_request.brand}` : "") + user_request.food_database_search_name
  const { databaseOptionsString, idMapping } = convertToDatabaseOptions(database_options)
  // console.log("databaseOptionsString", databaseOptionsString)
  let model = "ft:gpt-3.5-turbo-1106:hedge-labs::8nXQZjeQ"
  let max_tokens = 300
  let temperature = 0
  let prompt = matchUserRequestPrompt
    .replace("LOGGED_FOOD_NAME", foodToMatch)
    .replace("DATABASE_SEARCH_RESULTS", databaseOptionsString)

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: matchSystemPrompt },
    { role: "user", content: prompt }
  ]

  try {
    const timerStart = Date.now()
    const response = await chatCompletion(
      {
        messages,
        model,
        temperature,
        max_tokens
      },
      user
    )
    const timerEnd = Date.now()
    console.log("Time taken for food match:", timerEnd - timerStart, "ms") 

    // console.log(response)
    const database_match = remapIds(extractAndParseLastJSON(response.content!) as DatabaseMatch, idMapping);
    // console.log(database_match)
    if (database_match.no_good_matches || !database_match.best_food_match_id) {
      return [null, null];
    } else {
      const match1 = findMatchingItem(database_options, database_match.best_food_match_id);
      const match2 = findMatchingItem(database_options, database_match.alternative_match_id);
    
      return [match1, match2];
    }

  } catch (err) {
    console.error(err)
  }

  return [null, null]
}

async function testMatching() {
  const sampleUserRequest: FoodItemToLog = {
    food_database_search_name: "tuna steak",
    full_item_user_message_including_serving: "tuna",
    branded: false,
    brand: "",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  }

  const foodItems: FoodItemIdAndEmbedding[] = [
    { "id": 231, "name": "tuna steak", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 232, "name": "canned tuna", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 233, "name": "tuna nigiri", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 234, "name": "albacore tuna", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 235, "name": "albacore tuna can", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 236, "name": "tuna sushi roll", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 237, "name": "Tuna avocado maki", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 238, "name": "Spicy Tuna Rolls", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 239, "name": "Albacore Wild Tuna", brand: "365 Whole Foods Market", "cosine_similarity": 0, "embedding": "" },
    { "id": 240, "name": "spicy tuna avocado roll", brand: "", "cosine_similarity": 0, "embedding": "" },
    { "id": 241, "name": "spicy tuna avocado sushi roll", brand: "", "cosine_similarity": 0, "embedding": "" }
]

  const user: Tables<"User"> = {
    id: "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
    email: ""
  } as Tables<"User">
  const result  = await findBestFoodMatchtoLocalDb(foodItems, sampleUserRequest, user)
  console.log(result)
}

// testMatching()
