"use server"
import { authOptions } from "@/app/api/auth/[...nextauth]/auth"
import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"

export async function deleteSavedFood(loggedFoodItemId: number) {
  const session = await getServerSession(authOptions)

  console.log("Deleting food item")
  if (session) {
    let food = await prisma.loggedFoodItem.findUnique({
      where: {
        id: loggedFoodItemId
      }
    })
    if (!food) {
      console.error("Food not found")
      return
    }

    if (food.userId === session.user.userId) {
      await prisma.loggedFoodItem.delete({
        where: {
          id: loggedFoodItemId
        }
      })
    }

    return
  }
}
