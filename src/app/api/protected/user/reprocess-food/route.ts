export const dynamic = "force-dynamic"

import { processFoodItemQueue } from "@/app/api/queues/process-food-item/route"
import { prisma } from "@/database/prisma"
import { getUserFromRequest } from "@/utils/api-auth-tools"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("Reprocess food request")
  const user = await getUserFromRequest(request)

  const { foodId } = await request.json()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  if (!foodId) {
    return new Response("No foodId provided", { status: 400 })
  }

  const loggedFoodItem = await prisma.loggedFoodItem.findUnique({
    where: {
      id: foodId
    }
  })

  if (!loggedFoodItem) {
    return new Response("No food item with that id found", { status: 400 })
  }
  if (loggedFoodItem.userId !== user.id) {
    return new Response("User is not the owner of that logged food item. Cannot reprocess", { status: 400 })
  }

  await processFoodItemQueue.enqueue(
    `${loggedFoodItem.id}` // job to be enqueued
  )
  return NextResponse.json({ message: "Food item reprocessing enqueued" })
}
