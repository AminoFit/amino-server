import { prisma } from "@/database/prisma"
import { NextResponse } from "next/server"


// TODO Add auth?

export async function POST(request: Request) {
  console.log("got a POST request")

  const formData = await request.json()
  console.log("formData", formData)

  const foodItemId = formData.foodItemId as number
  const pathToImage = formData.pathToImage as string

  // Validate phone number
  if (!foodItemId) {
    return NextResponse.json({ error: "No foodItemId" }, { status: 400 })
  }
  if (!pathToImage) {
    return NextResponse.json({ error: "No pathToImage" }, { status: 400 })
  }

  const foodImage = await prisma.foodImage.create({
    data: {
      foodItemId,
      pathToImage
    }
  })

  return NextResponse.json({ message: "Success", now: Date.now(), foodImage })
}
