import { isWithinTokenLimit } from "gpt-tokenizer"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { chatCompletionInstruct, correctAndParseResponse } from "./chatCompletion"
import { User } from "@prisma/client"

// Token limit
const tokenLimit = 2048;

function sanitizeInput(input: string): string {
    const sanitizedInput = input.replace(/[^a-zA-Z0-9\s,]/g, '');
    return sanitizedInput;
}

function mapToFoodItemToLog(outputItem: any): FoodItemToLog {
    return {
        food_database_search_name: outputItem.food_database_search_name,
        brand: outputItem.brand,
        branded: outputItem.branded,
        base_food_name: outputItem.food_database_search_name, // Assuming the same as the comprehensive name
        serving: {
            serving_amount: outputItem.serving.serving_amount,
            serving_name: outputItem.serving.serving_name,
            total_serving_grams: outputItem.serving.total_serving_size_g_or_ml, // Using the grams value from the example, can adjust if needed
            total_serving_calories: 0, // Placeholder as the data is not provided
            is_liquid: outputItem.serving.g_or_ml === "ml",
            total_serving_ml: outputItem.serving.g_or_ml === "ml" ? outputItem.serving.total_serving_size_g_or_ml : undefined
        }
    };
}


export async function getFoodToLogFromUserRequest(user: User, user_request: string): Promise<FoodItemToLog[]> {
    const sanitizedUserRequest = sanitizeInput(user_request);
    if (!isWithinTokenLimit(sanitizedUserRequest, tokenLimit)) {
        console.log("Input too long.");
        return [];
    }
    const prompt = `Based on user_request give a structured JSON of what foods user wants to log. Group items.
Input:
user_request: "${sanitizedUserRequest}"
Output like this:
{
  food_database_search_name: string,
  serving: {
    serving_amount: number,
    serving_name: string,
    g_or_ml: "g"|"ml"
    total_serving_size_g_or_ml: number,
},
  branded: boolean,
  brand?: string,
}[]

Start of output:
[`;

    try {
        const result = await chatCompletionInstruct({
            prompt,
            temperature: 0,
            stop: ']',
        }, user);
        if (!result.text) {
            throw new Error("No text in the result");
        }
        const parsedOutput = correctAndParseResponse(`[`+result.text.trim()+`]`);
        if (!Array.isArray(parsedOutput) || parsedOutput.length === 0) {
            console.log(parsedOutput);
            throw new Error("Returned data is not in the expected format");
        }
        const foodItemsToLog: FoodItemToLog[] = parsedOutput.map(mapToFoodItemToLog);
        return foodItemsToLog;
    } catch (error) {
        if (error instanceof Error) {
            console.log("Error:", error.message);
        } else {
            console.log("Error:", error);
        }
        return [];
    }
}

async function testFoodLog() {
    const user: User = {
      id: "clmzqmr2a0000la08ynm5rjju",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      emailVerified: new Date("2022-08-09T12:00:00"),
      phone: "123-456-7890",
      dateOfBirth: new Date("1990-01-01T00:00:00"),
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
      tzIdentifier: "America/New_York"
    }
    let userRequestString = "I had a protein shake and a strawberry rxbar"
    let result = await getFoodToLogFromUserRequest(user, userRequestString)
    console.dir(result, { depth: null })
  }
  
  testFoodLog()
  