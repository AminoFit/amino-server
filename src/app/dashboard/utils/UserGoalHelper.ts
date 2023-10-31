"use server"
import { getServerSession } from "next-auth"

export async function getUser() {
  // const session = await getServerSession(authOptions)
  // if (session?.user?.email) {
  //   let aminoUser = await prisma.user.findUnique({
  //     where: {
  //       email: session.user.email
  //     }
  //   })
  //   return aminoUser
  // }
  // return
}

export type UserGoalsProps = {
  calorieGoal?: number
  proteinGoal?: number
  carbsGoal?: number
  fatGoal?: number
  fitnessGoal?: string
}

export async function saveUserGoals(updatedSettings: UserGoalsProps) {
  // const session = await getServerSession(authOptions)
  // if (session?.user?.email) {
  //   let aminoUser = await prisma.user.findUnique({
  //     where: {
  //       email: session.user.email
  //     }
  //   })
  //   if (!aminoUser) {
  //     return
  //   }
  //   let user = await prisma.user.update({
  //     where: {
  //       id: aminoUser.id
  //     },
  //     data: {
  //       ...updatedSettings
  //     }
  //   })
  //   return user
  // }
  // return
}
