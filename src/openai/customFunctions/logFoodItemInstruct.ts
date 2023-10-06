import { isWithinTokenLimit } from "gpt-tokenizer"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { chatCompletionInstruct } from "./chatCompletion"
import { User } from "@prisma/client"

// Token limit
const tokenLimit = 2048;

function sanitizeInput(input: string): string {
    const sanitizedInput = input.replace(/[^a-zA-Z0-9\s,]/g, '');
    return sanitizedInput;
}

export async function getFoodToLogFromUserRequest(user: User, user_request: string): Promise<FoodItemToLog | null> {
    const sanitizedUserRequest = sanitizeInput(user_request);

    if (!isWithinTokenLimit(sanitizedUserRequest, tokenLimit)) {
        console.log("Input too long.");
        return null;
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
            stop: ']',
        }, user);

        if (!result.text) {
            throw new Error("No text in the result");
        }

        const parsedOutput = JSON.parse(result.text.trim());
        
        if (!Array.isArray(parsedOutput) || parsedOutput.length === 0) {
            throw new Error("Returned data is not in the expected format");
        }

        const foodItemToLog: FoodItemToLog = parsedOutput[0];

        return foodItemToLog;

    } catch (error) {
        if (error instanceof Error) {
            console.log("Error:", error.message);
        } else {
            console.log("Error:", error);
        }
        return null;
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
    let userRequestString = "I ate 2 cups of Catalina Crunch Cereal"
    let result = await getFoodToLogFromUserRequest(user, userRequestString)
    console.dir(result, { depth: null })
  }
  
  testFoodLog()
  