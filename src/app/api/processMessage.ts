import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import UpdateMessage from "@/database/UpdateMessage"
import { GenerateResponseForUser } from "@/openai/RespondToMessage"
import {
  LogSmsMessage,
  SaveAndSendMessageToUser,
  SaveMessageToUser
} from "@/twilio/SendMessageToUser"
import { MessageStatus, MessageDirection, Role, User } from "@prisma/client"
import { NextResponse } from "next/server"

export enum MessageSource {
  Sms = "Sms",
  Web = "Web"
}

export default async function ProcessMessage(
  user: User,
  body: string,
  messageSource: MessageSource
) {
  const startTime = Date.now()
  await LogSmsMessage(user, body, MessageDirection.Inbound)

  let userMessage = await SaveMessageFromUser(user, body, Role.User)

  let responseMessage = await GenerateResponseForUser(user)

  if (responseMessage.responseToFunctionName) {
    // Save the message to the database
    await SaveMessageFromUser(
      user,
      responseMessage.resultMessage || "",
      Role.Function,
      responseMessage.responseToFunctionName
    )

    // Get a new response with that message now logged
    responseMessage = await GenerateResponseForUser(user)
  }

  if (messageSource === MessageSource.Sms) {
    await SaveAndSendMessageToUser(user, responseMessage.resultMessage || "")
  } else {
    await SaveMessageToUser(user, responseMessage.resultMessage || "")
  }
  console.log("The request took ", Date.now() - startTime, "ms")
  return NextResponse.json({ message: "Success" })
}
