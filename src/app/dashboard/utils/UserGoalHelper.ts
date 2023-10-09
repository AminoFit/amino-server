"use server"
import { prisma } from "@/database/prisma"
import { getSession } from "@auth0/nextjs-auth0"

export async function getUser() {
  const session = await getSession()

  if (session) {
    let aminoUser = await prisma.user.findUnique({
      where: {
        email: session.user.email
      }
    })
    return aminoUser
  }
  return
}

export type UserGoalsProps = {
  calorieGoal?: number
  proteinGoal?: number
  carbsGoal?: number
  fatGoal?: number
  fitnessGoal?: string
}

export async function saveUserGoals(updatedSettings: UserGoalsProps) {
  const session = await getSession()

  if (session) {
    if (session) {
      let aminoUser = await prisma.user.findUnique({
        where: {
          email: session.user.email
        }
      })

      if (!aminoUser) {
        return
      }

      let user = await prisma.user.update({
        where: {
          id: aminoUser.id
        },
        data: {
          ...updatedSettings
        }
      })
      return user
    }
  }
  return
}
