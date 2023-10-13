"use server"

import ProcessMessage, { MessageSource, QuickLogMessage } from "@/app/api/processMessage"
import { prisma } from "@/database/prisma"
import { getSession } from "@auth0/nextjs-auth0"

export async function sendMessage(newMessage: string) {
  if (!newMessage) return { error: "No message provided" }

  const session = await getSession()

  if (session) {
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

  const session = await getSession()

  if (session) {
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
