import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import { GenerateResponseForQuickLog } from "@/openai/RespondToMessage"
import {
  LogSmsMessage,
  SaveAndSendMessageToUser,
  SaveMessageToUser
} from "@/twilio/SendMessageToUser"
import { MessageStatus, MessageDirection, Role, User } from "@prisma/client"

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

  const inputMessage = await SaveMessageFromUser(user, body, Role.User)

  let responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)

  if (responseMessage.responseToFunctionName) {
    // Save the message to the database
    await SaveMessageFromUser(
      user,
      responseMessage.resultMessage || "",
      Role.Function,
      responseMessage.responseToFunctionName
    )

    // Get a new response with that message now logged
    responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)
  }

  if (messageSource === MessageSource.Sms) {
    await SaveAndSendMessageToUser(user, responseMessage.resultMessage || "")
  } else {
    await SaveMessageToUser(user, responseMessage.resultMessage || "")
  }
  console.log("The request took ", Date.now() - startTime, "ms")
  return responseMessage.resultMessage
}

/*
  Logs food in non-chat context. Should return a confirmation message or error message.
*/
export async function QuickLogMessage(user: User, body: string) {
  const startTime = Date.now()
  await LogSmsMessage(user, body, MessageDirection.Inbound)

  const inputMessage = await SaveMessageFromUser(user, body, Role.User, "quick_log_food_items", "FOOD_LOG_REQUEST")

  let responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)

  console.log("responseMessage", responseMessage)

  await SaveMessageToUser(user, responseMessage.resultMessage || "")

  console.log("The request took ", Date.now() - startTime, "ms")

  return responseMessage.resultMessage
}
