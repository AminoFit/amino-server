// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300


import { HandleLogFoodItem } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { prisma } from "@/database/prisma"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { NextResponse } from "next/server"

export async function GET(
  request: Request, // needed so we don't cache this request
  { params }: { params: { loggedFoodId: string } }
) {
  const loggedFoodIdString = params.loggedFoodId

  console.log("got a POST request to process food item")

  const loggedFoodId = parseInt(loggedFoodIdString)

  if (isNaN(loggedFoodId)) {
    return new Response("Invalid loggedFoodId", { status: 400 })
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
    return new Response("No Logged Food with that ID", { status: 400 })
  }

  if (loggedFoodItem.status !== "Needs Processing") {
    return NextResponse.json({ message: "Food does not need processing. Done" })
  }

  const openAiData = loggedFoodItem?.extendedOpenAiData?.valueOf() as any

  if (!openAiData) {
    return new Response("No openAiData", { status: 400 })
  }
  if (!openAiData.full_name) {
    return new Response("No full_name", { status: 400 })
  }
  if (!openAiData.serving) {
    return new Response("No serving", { status: 400 })
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

  return NextResponse.json({ text: "Processed Food" })
}
