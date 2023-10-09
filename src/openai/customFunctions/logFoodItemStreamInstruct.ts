import { isWithinTokenLimit } from "gpt-tokenizer"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { chatCompletionInstructStream } from "./chatCompletion"
import { User } from "@prisma/client"
import { prisma } from "../../database/prisma"
import { HandleLogFoodItems } from "../../database/OpenAiFunctions/HandleLogFoodItems";

// Token limit
const tokenLimit = 2048;

function sanitizeInput(input: string): string {
    const sanitizedInput = input.replace(/[^a-zA-Z0-9\s,]/g, '');
    return sanitizedInput;
}

function mapToFoodItemToLog(outputItem: any): FoodItemToLog {
    return {
        food_database_search_name: outputItem.food_database_complete_search_term,
        brand: outputItem.brand,
        branded: outputItem.branded,
        serving: {
            serving_amount: outputItem.serving.serving_amount,
            serving_name: outputItem.serving.serving_name,
            total_serving_g_or_ml: outputItem.serving.total_serving_size_g_or_ml,
            serving_g_or_ml: outputItem.serving.g_or_ml,
        }
    };
}


export async function logFoodItemStreamInstruct(user: User, user_request: string, lastUserMessageId: number): Promise<FoodItemToLog[]> {
    const sanitizedUserRequest = sanitizeInput(user_request);
    if (!isWithinTokenLimit(sanitizedUserRequest, tokenLimit)) {
        console.log("Input too long.");
        return [];
    }
    const prompt = `Based on user_request give a structured JSON of what foods user wants to log. Group items. Fix typos.
Input:
user_request: "${sanitizedUserRequest}"
Output like this:
{
    food_database_complete_search_term: string,
    serving: {
        serving_amount: number,
        serving_name: string,
        g_or_ml: "g"|"ml"
        total_serving_size_g_or_ml: number,
    },
    branded: boolean,
    brand: string | null,
}[]

Start of output:
[`;

    const foodItemsToLog: FoodItemToLog[] = [];
    const loggingTasks: Promise<any>[] = [];
    const messageInfo = await prisma.message.findUnique({
        where: { id: lastUserMessageId },
        select: {
            itemsProcessed: true
        }
    });
    const itemsAlreadyProcessed = messageInfo?.itemsProcessed || 0;

    let itemsExtracted = 0;

    try {
        for await (const chunk of chatCompletionInstructStream({
            prompt,
            temperature: 0,
            stop: ']',
        }, user)) {
            // increment the number of items extracted
            itemsExtracted++;
            // map to a FoodItemToLog schema
            const foodItemToLog: FoodItemToLog = mapToFoodItemToLog(chunk);
            itemsExtracted++;
            console.dir(foodItemToLog);
            foodItemsToLog.push(foodItemToLog);
            // Skip processing if this item is already processed
            if (itemsExtracted <= itemsAlreadyProcessed) {
                continue;
            }
            // Add logging task to the tasks array
            const loggingTask = HandleLogFoodItems(user, { food_items: [foodItemToLog] }, lastUserMessageId);
            loggingTasks.push(loggingTask);
        }

        // Wait for all logging tasks to complete
        const results = await Promise.allSettled(loggingTasks);
        
        // Optionally, you can handle the results:
        // e.g., to log errors if any task failed
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error("Error while logging food item:", result.reason);
            }
        }

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
    let userRequestString = "20g of peanut butter"
    let result = await logFoodItemStreamInstruct(user, userRequestString, 1)
    //console.dir(result, { depth: null })
  }
  
  //testFoodLog()
  