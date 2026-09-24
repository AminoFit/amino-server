import { z } from "zod"
import { foodCompletion } from "@/foodResolution/model"
import { foodExtractionPrompt } from "./logFoodItemPrompts"
import { sanitizeFoodItemNutritionFieldsJSON } from "../common/sanitizeNutrients"
import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import type { Tables } from "types/supabase"

const extractedFood=z.object({
  full_single_food_database_search_name:z.string().min(1),
  full_single_item_user_message_including_serving_or_quantity:z.string().min(1),
  branded:z.boolean(),brand:z.string().optional(),
  upc:z.number().int().positive().optional(),
  nutritional_information:z.record(z.union([z.number(),z.string()])).optional()
})
const extraction=z.object({food_items:z.array(extractedFood).max(30),contains_valid_food_items:z.boolean()})

export function parseFoodExtraction(content:string,consumedOn:Date):{foodItemsToLog:FoodItemToLog[];isBadFoodLogRequest:boolean}{
  const data=extraction.parse(JSON.parse(content))
  const foodItemsToLog=data.food_items.map((item,index)=>({
    ...sanitizeFoodItemNutritionFieldsJSON(item),
    timeEaten:new Date(consumedOn.getTime()+index*10).toISOString()
  }))
  return {foodItemsToLog,isBadFoodLogRequest:!data.contains_valid_food_items}
}

export async function logFoodItemStream(
  user:Tables<"User">,message:Tables<"Message">,consumedOn:Date=new Date()
):Promise<{foodItemsToLog:FoodItemToLog[];isBadFoodLogRequest:boolean}>{
  const template=foodExtractionPrompt
  const content=await foodCompletion({systemPrompt:template.systemPrompt,
    userMessage:template.prompt.replace("INPUT_HERE",message.content).replace("Beginning of JSON output:",""),
    max_tokens:8192},user)
  return parseFoodExtraction(content,consumedOn)
}
