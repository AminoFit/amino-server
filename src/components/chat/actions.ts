"use server"

import { authOptions } from "@/app/api/auth/[...nextauth]/auth"
import ProcessMessage, { MessageSource, QuickLogMessage } from "@/app/api/processMessage"
import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"

export async function sendMessage(newMessage: string) {
  if (!newMessage) return { error: "No message provided" }

  const session = await getServerSession(authOptions)

  if (session) {
    let user = await prisma.user.findUnique({
      where: {
        id: session.user.userId
      }
    })

    if (user) {
      const message = await QuickLogMessage(user, newMessage)
      console.log("message", message)
      return { message }
    }
  }
  return { error: "No session" }
}
