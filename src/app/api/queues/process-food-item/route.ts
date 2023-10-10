// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { HandleLogFoodItem } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { prisma } from "@/database/prisma"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

import { Queue } from "quirrel/next-app"

export const processFoodItemQueue = Queue(
  "api/queues/process-food-item", // 👈 the route it's reachable on
  async (loggedFoodIdString: string) => {
    console.log("The payload:", loggedFoodIdString)

    const loggedFoodId = parseInt(loggedFoodIdString)

    if (isNaN(loggedFoodId)) {
      throw new Error("Invalid loggedFoodId")
    }

    const loggedFoodItem = await prisma.loggedFoodItem.findUnique({
      where: {
        id: loggedFoodId
      },
      include: {
        User: true
      }
    })

    if (!loggedFoodItem) {
      throw new Error("No Logged Food with that ID")
    }

    if (loggedFoodItem.status !== "Needs Processing") {
      throw new Error("Food does not need processing.")
    }

    const openAiData = loggedFoodItem?.extendedOpenAiData?.valueOf() as any

    if (!openAiData) {
      throw new Error("No openAiData")
    }
    if (!openAiData.food_database_search_name) {
      throw new Error("No food_database_search_name")
    }
    if (!openAiData.serving) {
      throw new Error("No serving")
    }

    if (loggedFoodItem.messageId) {
      await HandleLogFoodItem(
        loggedFoodItem,
        openAiData as FoodItemToLog,
        loggedFoodItem.messageId,
        loggedFoodItem.User
      )
    } else {
      console.log("No messageId")
    }

    console.log("Done processing food item", loggedFoodItem.id)

    return
  }
)

export const POST = processFoodItemQueue
