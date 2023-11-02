import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import { GenerateResponseForQuickLog } from "@/openai/RespondToMessage"
import { Tables, Enums } from "types/supabase"

export enum MessageSource {
  Sms = "Sms",
  Web = "Web"
}

export default async function ProcessMessage(user: Tables<"User">, body: string, messageSource: MessageSource) {
  // const startTime = Date.now()
  // await LogSmsMessage(user, body, "Inbound")
  // const inputMessage = await SaveMessageFromUser(user, body, "User", "PROCESS_MESSAGE_REQUEST")
  // let responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)
  // if (responseMessage.responseToFunctionName) {
  //   // Save the message to the database
  //   await SaveMessageFromUser(
  //     user,
  //     responseMessage.resultMessage || "",
  //     "Function",
  //     responseMessage.responseToFunctionName
  //   )
  //   // Get a new response with that message now logged
  //   responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)
  // }
  // if (messageSource === MessageSource.Sms) {
  //   await SaveAndSendMessageToUser(user, responseMessage.resultMessage || "")
  // } else {
  //   await SaveMessageToUser(user, responseMessage.resultMessage || "")
  // }
  // console.log("The request took ", Date.now() - startTime, "ms")
  // return responseMessage.resultMessage
}

/*
  Logs food in non-chat context. Should return a confirmation message or error message.
*/
export async function QuickLogMessage(user: Tables<"User">, body: string) {
  const startTime = Date.now()
  // await LogSmsMessage(user, body, "Inbound")

  console.log("Trace 1")

  const inputMessage = await SaveMessageFromUser(user, body, "User", "quick_log_food_items", "FOOD_LOG_REQUEST")

  console.log("Trace 2")

  if (!inputMessage) throw new Error("No input message")
  let responseMessage = await GenerateResponseForQuickLog(user, inputMessage.id)

  console.log("Trace 3")

  console.log("responseMessage", responseMessage)

  // await SaveMessageToUser(user, responseMessage.resultMessage || "")

  console.log("The request took ", Date.now() - startTime, "ms")

  return responseMessage.resultMessage
}
