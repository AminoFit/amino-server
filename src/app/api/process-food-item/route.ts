import { HandleLogFoodItem } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { prisma } from "@/database/prisma"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("Only POST allowed", {
    status: 400
  })
}

export async function POST(request: Request) {
  console.log("got a POST request to process food item")

  const jsonData = await request.json()

  console.log("Need to process the following food jsonData", jsonData)

  const loggedFoodItem = await prisma.loggedFoodItem.findUnique({
    where: {
      id: jsonData.id
    },
    include: {
      User: true
    }
  })

  console.log("food from DB", loggedFoodItem)

  const openAiData = loggedFoodItem?.extendedOpenAiData?.valueOf() as any

  if (!loggedFoodItem) {
    return new Response("Food item not found in DB", { status: 400 })
  }
  if (!openAiData) {
    return new Response("No openAiData", { status: 400 })
  }
  if (!openAiData.full_name) {
    return new Response("No full_name", { status: 400 })
  }
  if (!openAiData.serving) {
    return new Response("No serving", { status: 400 })
  }

  await HandleLogFoodItem(
    loggedFoodItem,
    openAiData as FoodItemToLog,
    loggedFoodItem.id,
    loggedFoodItem.User
  )

  console.log("Done processing food item", loggedFoodItem.id)

  return NextResponse.json({ text: "get ok" })
}
