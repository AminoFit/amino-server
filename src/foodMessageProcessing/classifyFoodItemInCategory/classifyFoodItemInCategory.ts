import {
  anthropicChatCompletion,
  anthropicBedrockChatCompletion
} from "@/languageModelProviders/anthropic/anthropicChatCompletion"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { foodItemCategoriesList } from "./foodItemCategories"
import Anthropic from "@anthropic-ai/sdk"
import { Tables } from "types/supabase-generated.types"

interface FoodClassifyResult {
  reasoning: string
  topThreeOptions: string[]
  reasoningForBestOption: string
  ID: string
  subcategoryName: string
}

export async function classifyFoodItemToCategory(
  foodItem: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<{ foodItemCategoryID: string; foodItemCategoryName: string }> {
  const foodItemName = foodItem.brand ? `${foodItem.name} by ${foodItem.brand}` : foodItem.name

  const prompt =
    `RULES:
1. Look at item to match and think carefully about what it is (include that in reasoning) and what ingredients it usually has if a processed food.

2. Look at item list comprehensively.

3. Choose 3 possible candidates for the item to match to assing topThreeOptions. Just use the IDs of the categories.

4. Review all 3 candidates.

5. Select one that is most similar to the item. Choose other categories when there is not a good match.

6. When you have decided after reasoning, output as JSON with this template:

{
"reasoning":"string",
"topThreeOptions":"string[]",
"reasoningForBestOption":"string",
"ID":"string",
"subcategoryName":"string"
}

subcategoryName is the name of the subcategory (after the identifier) that the item belongs to e.g B-6-2	Danishes it would be "Danishes"

Item to match: ${foodItemName}\n` + foodItemCategoriesList

  let messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt
        }
      ]
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "{"
        }
      ]
    }
  ] as Anthropic.Messages.MessageParam[]

  try {
    const bedrockResult = await anthropicBedrockChatCompletion(
      {
        messages,
        model: "anthropic.claude-3-sonnet-20240229-v1:0"
      },
      user
    )
    const result: FoodClassifyResult = JSON.parse(bedrockResult)
    if (result && result.ID && result.subcategoryName) {
      return { foodItemCategoryID: result.ID, foodItemCategoryName: result.subcategoryName }
    } else {
      throw new Error("Bedrock classification failed")
    }
  } catch (error) {
    console.error("Bedrock classification failed, falling back to Anthropic", error)
    const anthropicResult = await anthropicChatCompletion(
      {
        messages,
        model: "claude-3-sonnet-20240229"
      },
      user
    )
    const result: FoodClassifyResult = JSON.parse(anthropicResult)
    if (result && result.ID && result.subcategoryName) {
      return { foodItemCategoryID: result.ID, foodItemCategoryName: result.subcategoryName }
    } else {
      throw new Error("Anthropic classification also failed")
    }
  }
}
