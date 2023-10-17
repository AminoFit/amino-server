"use server"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"

export async function deleteSavedFood(loggedFoodItemId: number) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return
  }

  let aminoUser = await prisma.user.findUnique({
    where: {
      email: session?.user.email
    }
  })

  console.log("Deleting food item")
  if (session && aminoUser) {
    let food = await prisma.loggedFoodItem.findUnique({
      where: {
        id: loggedFoodItemId
      }
    })
    if (!food) {
      console.error("Food not found")
      return
    }

    if (food.userId === aminoUser.id) {
      await prisma.loggedFoodItem.delete({
        where: {
          id: loggedFoodItemId
        }
      })
    }

    return
  }
}
