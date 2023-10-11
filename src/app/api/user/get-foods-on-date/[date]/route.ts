export const dynamic = "force-dynamic"

import { getUser } from "@/app/dashboard/settings/actions"
import { prisma } from "@/database/prisma"
import moment from "moment-timezone"
import { NextResponse } from "next/server"

function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, (_, value) => (typeof value === "bigint" ? value.toString() : value))
}

export async function GET(
  _request: Request, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  const user = await getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  const dateString = params.date
  if (!dateString) {
    return new Response("No date provided", { status: 400 })
  }

  const parsedDate = moment.tz(dateString, "YYYY-MM-DD", user.tzIdentifier)

  if (!parsedDate.isValid()) {
    return new Response("Provided date is invalid. Must be in YYYY-MM-DD format", { status: 400 })
  }

  let foods = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gte: parsedDate.startOf("day").toDate(),
        lte: parsedDate.endOf("day").toDate()
      }
    },
    select: {
      FoodItem: {
        include: { Servings: true, FoodImage: true }
      },
      foodEmbeddingCache: false,
      embeddingId: false,
      consumedOn: true,
      grams: true,
      servingAmount: true,
      loggedUnit: true,
      status: true,
      extendedOpenAiData: true,
    }
  })

  const safeFoodsString = stringifyWithBigInt(foods)
  return NextResponse.json(JSON.parse(safeFoodsString))
}
