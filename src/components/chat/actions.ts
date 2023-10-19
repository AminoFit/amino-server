"use server"

import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ProcessMessage, { MessageSource, QuickLogMessage } from "@/app/api/processMessage"
import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"

export async function sendMessage(newMessage: string) {
  if (!newMessage) return { error: "No message provided" }

  const session = await getServerSession(authOptions)

  if (session?.user?.email) {
    let aminoUser = await prisma.user.findUnique({
      where: {
        email: session.user.email
      }
    })

    if (aminoUser) {
      const message = await ProcessMessage(aminoUser, newMessage, MessageSource.Web)
      console.log("message", message)
      return { message }
    }
  }
  return { error: "No session" }
}

export async function QuickLogFoodMessage(newMessage: string) {
  if (!newMessage) return { error: "No message provided" }

  const session = await getServerSession(authOptions)

  if (session?.user?.email) {
    let aminoUser = await prisma.user.findUnique({
      where: {
        email: session.user.email
      }
    })

    if (aminoUser) {
      const message = await QuickLogMessage(aminoUser, newMessage)
      console.log("message", message)
      return { message }
    }
  }
  return { error: "No session" }
}
