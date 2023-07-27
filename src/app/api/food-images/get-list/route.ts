export const runtime = "nodejs"

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

  return NextResponse.json(
    { message: "Success", now: Date.now(), foods },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=1",
        "CDN-Cache-Control": "public, s-maxage=1",
        "Vercel-CDN-Cache-Control": "public, s-maxage=1"
      }
    }
  )
}
