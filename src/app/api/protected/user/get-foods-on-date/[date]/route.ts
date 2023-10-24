export const dynamic = "force-dynamic"

import { prisma } from "@/database/prisma"
import { getUserFromRequest } from "@/utils/api-auth-tools"
import moment from "moment-timezone"
import { NextRequest, NextResponse } from "next/server"

function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
}

export async function GET(
  request: NextRequest, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  console.log("GET request")
  const user = await getUserFromRequest(request)

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
    include: {
      FoodItem: {
        include: { Servings: true, FoodImage: true }
      }
    }
  })

  console.log("foods", foods)

  const safeFoodsString = stringifyWithBigInt(foods);
  return NextResponse.json(JSON.parse(safeFoodsString)); 
}
