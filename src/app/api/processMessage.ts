import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import { GenerateResponseForUser } from "@/openai/RespondToMessage"
import {
  LogSmsMessage,
  SaveAndSendMessageToUser,
  SaveMessageToUser
} from "@/twilio/SendMessageToUser"
import { MessageDirection, Role, User } from "@prisma/client"
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
  await LogSmsMessage(user, body, MessageDirection.Inbound)

  await SaveMessageFromUser(user, body, Role.User)
  console.log("body", body)

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

  return NextResponse.json({ message: "Success" })
}
