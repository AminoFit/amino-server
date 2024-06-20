import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { claudeChatCompletion } from "@/languageModelProviders/anthropic/anthropicChatCompletion"
import Anthropic from "@anthropic-ai/sdk"
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

const matchUserRequestPrompt = `You are a food matching expert. Your task is to accurately match the user's logged food to entries in a database.

<user_food_logged>
LOGGED_FOOD_NAME
</user_food_logged>

<database_search_results>
DATABASE_SEARCH_RESULTS
</database_search_results>

<instructions>
Find the exact match for the user's logged food in the database search results:

1. Look at user_food_logged and make reasonable assumptions (e.g., "milk" could mean "whole milk" or "fat free milk").
2. Find an exact match in database_search_results, considering user-specified constraints like brand. It must be the same type of item.
3. Ensure the match is comprehensive and nutritionally equivalent. For example, "bread with brie" can't match "bread" alone.
3a. If a partial match is found, set extra_item_name to the unmatched food component.
4. If no good matches exist due to nutritional differences (e.g., "milk" vs "milk powder"), set is_correct_match to false.

Output the result in this JSON format, with each field looking like this:

"reasoning" (string): Provide a brief explanation of what the item the user wants and if potential matches are exact in terms of item and nutrition (e.g. be sure we respect things like fat, caffeine etc content)
"exact_food_match_id" (number | null): The id of the best matching food item from the database. If no good match is found, set this to null.
"alternative_match_id" (number | null): If there is a second potential match that the user might have meant, include its id here. If there are no alternative matches, set this to null.
"is_correct_match" (boolean): Set to true if the exact_food_match_id is a comprehensive match as  user_food_logged. Otherwise we set to false to continue searching online for a better match. It MUST be an exact match i.e. consider similarity in terms of macro and micronutrient content.
"extra_item_name" (string | null): If the exact match is only a partial match (e.g., "bread" when the user logged "bread with brie"), put the unmatched food component here. If the match is complete or there is no match, set this to null.
</instructions>

<examples>
1. If user had specified 'blueberry bagel' we cannot match with say 'everything bagel' since that user specified a specific type.
2. If user had specified 'royal gala' matching with 'apple' (so long as royal gala is not in the list) is fine since they are the same nutritionally.
3. If user had specified 'chobani oat milk' we should only match with chobani branded oat milk since the brand can impact nutrition.
4. If user had specified 'butter' we could match with say 'unsalted butter' but have 'unsalted butter' as second match (if available).
5. If user had specified 'unsalted butter' we must never match with 'salted butter' since it is clearly different.
6. If user had specified 'greek yogurt' we must never match with 'honey greek yogurt' since it contains extra ingredients than what user wanted.
</examples>

<format>
{ "reasoning": "string", "exact_food_match_id": "number | null", "alternative_match_id": "number | null", "is_correct_match": boolean,  "extra_item_name": "string | null" }
</format>`

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
    (key) => mapping[key] === match.exact_food_match_id
  );

  // Find the original ID for the alternative match using the helper to determine if it should be an int
  const originalIdForAlternativeMatch = Object.keys(mapping).find(
    (key) => mapping[key] === match.alternative_match_id
  );

  // Cast numeric string to integer if appropriate, otherwise leave as string
  remappedMatch.exact_food_match_id = originalIdForBestMatch ? parseIfNumeric(originalIdForBestMatch) : null;
  remappedMatch.alternative_match_id = originalIdForAlternativeMatch ? parseIfNumeric(originalIdForAlternativeMatch) : null;

  return remappedMatch;
};


interface DatabaseMatch {
  is_correct_match: boolean
  exact_food_match_id?: number | string | null
  alternative_match_id?: number | string | null
  extra_item_name?: string | null
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


export async function findBestFoodMatchtoLocalDbClaude(
  database_options: FoodItemIdAndEmbedding[],
  user_request: FoodItemToLog,
  user: Tables<"User">
): Promise<[FoodItemIdAndEmbedding | null, FoodItemIdAndEmbedding | null]> {
  const foodToMatch = (user_request.brand ? ` - ${user_request.brand}` : "") + user_request.food_database_search_name
  const { databaseOptionsString, idMapping } = convertToDatabaseOptions(database_options)

  let model = "claude-3-haiku"
  let max_tokens = 400
  let temperature = 0
  let prompt = matchUserRequestPrompt
    .replace("LOGGED_FOOD_NAME", foodToMatch)
    .replace("DATABASE_SEARCH_RESULTS", databaseOptionsString)

  let messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: `{`
    }
  ]

  try {
    const timerStart = Date.now()
    const response = await claudeChatCompletion(
      {
        system: matchSystemPrompt,
        messages,
        model,
        temperature,
        max_tokens,
        provider: "anthropic"
      },
      user
    )
    const timerEnd = Date.now()
    console.log("Time taken for food match:", timerEnd - timerStart, "ms")

    let database_match: DatabaseMatch | null = null

    try {
      database_match = remapIds(extractAndParseLastJSON(`{`+response) as DatabaseMatch, idMapping)
    } catch (err) {
      console.error("Failed to parse JSON response. Retrying with claude-3-5-sonnet model.")
      model = "claude-3-5-sonnet"
      const retryResponse = await claudeChatCompletion(
        {
          system: matchSystemPrompt,
          messages,
          model,
          temperature,
          max_tokens,
          provider: "anthropic"
        },
        user
      )
      database_match = remapIds(extractAndParseLastJSON(`{`+retryResponse) as DatabaseMatch, idMapping)
    }

    if (database_match === null || !database_match.is_correct_match || !database_match.exact_food_match_id) {
      return [null, null]
    } else {
      const match1 = findMatchingItem(database_options, database_match.exact_food_match_id);
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
    food_database_search_name: "Spicy tuna sushi roll",
    full_item_user_message_including_serving: "tuna",
    branded: false,
    brand: "",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  }

  const foodItems: FoodItemIdAndEmbedding[] = [
    { id: 231, name: "tuna steak", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 232, name: "canned tuna", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 233, name: "tuna nigiri", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 234, name: "albacore tuna", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 235, name: "albacore tuna can", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 236, name: "tuna sushi roll", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 237, name: "Tuna avocado maki", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 238, name: "Spicy Tuna Rolls", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 239, name: "Albacore Wild Tuna", brand: "365 Whole Foods Market", cosine_similarity: 0, embedding: "" },
    { id: 240, name: "spicy tuna avocado roll", brand: "", cosine_similarity: 0, embedding: "" },
    { id: 241, name: "spicy tuna avocado sushi roll", brand: "", cosine_similarity: 0, embedding: "" }
  ]

  const user: Tables<"User"> = {
    id: "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
    email: ""
  } as Tables<"User">
  const result = await findBestFoodMatchtoLocalDbClaude(foodItems, sampleUserRequest, user)
  console.log(result)
}

// testMatching()
