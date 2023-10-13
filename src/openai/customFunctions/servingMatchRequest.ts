import { prisma } from "../../database/prisma";
import { chatCompletionInstruct, correctAndParseResponse } from "./chatCompletion";
import { User } from "@prisma/client";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

interface ServingMatchRequest {
    user_message: string,
    item_name: string,
    item_brand: string | null,
    item_properties: {
      name: string,
      brand: string | null,
      default_serving_size_grams: number | null,
      default_serving_size_ml: number | null,
      default_serving_calories: number,
      servings: {
        serving_id: number,
        name: string,
        serving_weight_grams: number | null,
        serving_alternate_unit: string | null,
        serving_alternate_amount: number | null,
      }[]
    }
  }

async function getMessageContent(messageId: number): Promise<string> {
  const message = await prisma.message.findUnique({
    where: {
      id: messageId
    }
  });
  return message?.content || '';
}
async function findBestServingMatch(
    messageId: number,
    food_item: FoodItemWithNutrientsAndServing,
    user: User
  ): Promise<{ user_serving_id: number | null, user_serving_size_grams: number, serving_name: string | null, serving_amount: number | null } | null> {
    // Fetch the message content from Prisma using the messageId
    const message = await getMessageContent(messageId);
    const matchRequest: ServingMatchRequest = {
        user_message: message,
        item_name: food_item.name,
        item_brand: food_item.brand,
        item_properties: {
          name: food_item.name,
          brand: food_item.brand,
          default_serving_size_grams: food_item.defaultServingWeightGram,
          default_serving_size_ml: food_item.defaultServingLiquidMl,
          default_serving_calories: food_item.kcalPerServing,
          servings: food_item.Servings.map(serving => ({
            serving_id: serving.id,
            name: serving.servingName,
            serving_weight_grams: serving.servingWeightGram,
            serving_alternate_unit : serving.servingAlternateUnit,
            serving_alternate_amount: serving.servingAlternateAmount,
          }))
        }
      }
    
      const model = "gpt-3.5-turbo-instruct-0914";
      const max_tokens = 250;
      const temperature = 0;
      const prompt = 
      `Based on user_message complete with this template:
      { user_serving_id: number | null,
      user_serving_size_grams: number,
      serving_name: string | null,
      serving_amount: number | null }
      
      ${JSON.stringify(matchRequest)}
      
      Output: 
      {`.trim();

      console.log(prompt);

      throw new Error("test");
    
      try {
        const result = await chatCompletionInstruct(
          {
            prompt: prompt.trim(),
            model: model,
            temperature: temperature,
            max_tokens: max_tokens,
            stop: "}"
          },
          user
        )
    
        const response = correctAndParseResponse("{" + result.text!.trim() + "}");
    
        // If no valid match is found, return null
        if (!response.user_serving_size_grams) {
          return null;
        }
    
        return {
          user_serving_id: response.user_serving_id || null,
          user_serving_size_grams: response.user_serving_size_grams,
          serving_name: response.serving_name || null,
          serving_amount: response.serving_amount || null
        };
      } catch (error) {
        console.log(error);
        return null;
      }
    }


async function testServingMatchRequest(){
    const messageId = 116;
    const food_item: FoodItemWithNutrientsAndServing = {
        id: 33,
        name: "English Muffin",
        brand: "Thomas'",
        knownAs: [],  // Assuming knownAs should be an array, given the empty "{}" provided
        description: null,
        defaultServingWeightGram: 57,
        defaultServingLiquidMl: null,
        isLiquid: false,
        weightUnknown: false,
        kcalPerServing: 100,
        totalFatPerServing: 1,
        satFatPerServing: 0,
        transFatPerServing: 0,
        carbPerServing: 26,
        fiberPerServing: 8,
        sugarPerServing: 0.5,
        addedSugarPerServing: 0,
        proteinPerServing: 4,
        lastUpdated: new Date("2023-10-10 15:12:38.482"),
        verified: true,
        externalId: "65097fd7b67c11000af38692",
        UPC: null,
        userId: null,
        messageId: 28,
        foodInfoSource: "NUTRITIONIX",
        Servings: [{
            id: 111,
            servingWeightGram: 57,
            servingName: "1 muffin",
            foodItemId: 33,
            servingAlternateAmount: 1,
            servingAlternateUnit: "muffin"
        }],
        Nutrients: []  // No nutrient data provided in the example so initializing an empty array
    };
    const user: User = {
        id: "clklnwf090000lzssqhgfm8kr",
        firstName: "Sebastian",
        lastName: "",
        email: "seb.grubb@gmail.com",
        emailVerified: new Date("2023-10-09 22:45:35.771"),
        phone: "+16503079963",
        dateOfBirth: new Date("1992-05-06 04:00:00"),
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
    };

    const result = await findBestServingMatch(messageId, food_item, user);
    console.log(result);
}

testServingMatchRequest()