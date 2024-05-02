import { claudeChatCompletion } from "@/languageModelProviders/anthropic/anthropicChatCompletion"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { foodItemCategoriesList, food_classify_prompt_by_model } from "./foodItemCategories"
import Anthropic from "@anthropic-ai/sdk"
import { Tables } from "types/supabase-generated.types"
import { getUserByEmail } from "../common/debugHelper"
import { FireworksChatCompletion } from "@/languageModelProviders/fireworks/chatCompletionFireworks"
import { mean, std, quantileSeq } from 'mathjs';
import OpenAI from "openai"

interface FoodClassifyResult {
  reasoning: string
  topThreeOptions: string[]
  reasoningForBestOption: string
  ID: string
  subcategoryName: string
}

export async function classifyFoodItemToCategoryLlama(
  foodItem: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<{ foodItemCategoryID: string; foodItemCategoryName: string; foodItemId: number }> {
  const foodItemName = foodItem.brand ? `${foodItem.name} by ${foodItem.brand}` : foodItem.name;
  const temperature = 0.5;

  const prompt = food_classify_prompt_by_model['llama-3-70b'].prompt.replace("FOOD_ITEM_TO_CLASSIFY", foodItemName).replace("LIST_OF_CATEGORIES", foodItemCategoriesList);

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "Please classify the following food item."
    },
    {
      role: "user",
      content: prompt
    }
  ];

  try {
    const response = await FireworksChatCompletion(
      user,
      {
        messages,
        model: "llama-v3-70b-instruct",
        temperature,
        max_tokens: 1024
      }
    );

    const result: FoodClassifyResult = JSON.parse(response); // Parse response here according to the actual format returned by Fireworks
    if (result && result.ID && result.subcategoryName) {
      return { foodItemCategoryID: result.ID, foodItemCategoryName: result.subcategoryName, foodItemId: foodItem.id };
    } else {
      throw new Error("LLaMA classification failed");
    }
  } catch (error) {
    throw new Error("Unable to classify food item with LLaMA", error as Error);
  }
}

export async function classifyFoodItemToCategory(
  foodItem: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<{ foodItemCategoryID: string; foodItemCategoryName: string; foodItemId: number }> {
  const foodItemName = foodItem.brand ? `${foodItem.name} by ${foodItem.brand}` : foodItem.name
  const temperature = 0.5

  const prompt = food_classify_prompt_by_model['claude-3-haiku'].prompt.replace("FOOD_ITEM_TO_CLASSIFY", foodItemName).replace("LIST_OF_CATEGORIES", foodItemCategoriesList)

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
    const classifyResult = await claudeChatCompletion(
      {
        messages,
        model: "claude-3-haiku",
        temperature,
        provider: "bedrock",
        max_tokens: 1024,
      },
      user
    )
    const result: FoodClassifyResult = JSON.parse(`{` + classifyResult)
    if (result && result.ID && result.subcategoryName) {
      return { foodItemCategoryID: result.ID, foodItemCategoryName: result.subcategoryName, foodItemId: foodItem.id }
    } else {
      throw new Error("Bedrock classification failed")
    }
  } catch (error) {
    throw new Error("Unable to classify food item with either provider", error as Error)
  }
}

async function testClassification() {
  const foodItem = { name: "Apple Crumble", id: "123", brand: "" }
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const result = await classifyFoodItemToCategory(foodItem as any, user!)
  console.log(result)
}

async function benchmarkClassification() {
  const foodItems = [
    { name: "Apple Crumble", id: "123", brand: "" },
    { name: "Apple Pie", id: "124", brand: "McDonalds" },
    { name: "Banana Bread", id: "125", brand: "" },
    { name: "Blueberry Muffin", id: "126", brand: "" },
    { name: "Brownie", id: "127", brand: "" },
    { name: "Cake", id: "128", brand: "" },
    { name: "Cheesecake", id: "129", brand: "" },
    { name: "Chocolate Chip Cookie", id: "130", brand: "" },
    { name: "Cookie", id: "131", brand: "" },
    { name: "Cupcake", id: "132", brand: "" },
    { name: "Sushi Avocado Roll", id: "133", brand: "" },
    { name: "Fajitas", id: "134", brand: "" },
    { name: "Fried Rice", id: "135", brand: "" },
    { name: "Fruit Salad", id: "136", brand: "" },
    { name: "Ice Cream", id: "137", brand: "" },
    { name: "Strawberry Shortcake", id: "138", brand: "" },
    { name: "Lemon Bar", id: "139", brand: "WhyBar" },
    { name: "Hyro Whey Protein Powder", id: "140", brand: "Optimum Nutrition" },
    { name: "Peanut Butter", id: "141", brand: "" },
    { name: "Pizza", id: "142", brand: "" },
    { name: "Popcorn", id: "143", brand: "" },
    // Add more food items as needed
  ];
  
  const timings = [];
  const user = await getUserByEmail("seb.grubb@gmail.com");

  for (const foodItem of foodItems) {
    const startTime = performance.now();
    try {
      await classifyFoodItemToCategory(foodItem as any, user!);
    } catch (error) {
      console.error("Error during classification:", error);
      continue; // Skip on error
    }
    const endTime = performance.now();
    const timeTaken = endTime - startTime;
    timings.push(timeTaken);
  }
  
  console.log("Timings (ms):", timings);
  console.log("Average time (ms):", mean(timings));
  console.log("Standard deviation (ms):", std(timings));
  console.log("5th percentile (ms):", quantileSeq(timings, 0.05));
  console.log("25th percentile (ms):", quantileSeq(timings, 0.25));
  console.log("Median (50th percentile) (ms):", quantileSeq(timings, 0.5));
  console.log("75th percentile (ms):", quantileSeq(timings, 0.75));
  console.log("95th percentile (ms):", quantileSeq(timings, 0.95));
}

// testClassification()
// benchmarkClassification()