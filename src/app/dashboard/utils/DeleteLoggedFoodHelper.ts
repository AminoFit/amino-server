"use server"
import { prisma } from "@/database/prisma"
import { getSession } from "@auth0/nextjs-auth0"

export async function deleteSavedFood(loggedFoodItemId: number) {
  const session = await getSession()

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
