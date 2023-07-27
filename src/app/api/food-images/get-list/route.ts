export const runtime = 'edge';

import { prisma } from "@/database/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  console.log("got a GET request")

  const foods = await prisma.foodItem.findMany({
    where: {
      FoodImage: {
        none: {}
      }
    },
    include: {
      FoodImage: true
    }
  })

  return NextResponse.json({ message: "Success", now: Date.now(), foods })
}
