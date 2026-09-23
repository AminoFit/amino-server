import { AddLoggedFoodItemToQueue } from "./addLogFoodItemToQueue"
import { refreshFoodMessageProgress } from "./common/refreshFoodMessageProgress"
// Database related imports
import { GetMessageById, GetMessagesForUser } from "@/database/GetMessagesForUser"
import UpdateMessage from "@/database/UpdateMessage"

// Utility and function schemas
import {
  logExerciseSchema,
  logFoodSchema,
  showDailyFoodSummarySchema,
  updateUserInfoSchema
} from "@/utils/openaiFunctionSchemas"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

// OpenAI related imports
import OpenAI from "openai"
import { ChatCompletionRole } from "openai/resources/chat"

// Custom functions and helpers
import { ProcessFunctionCalls } from "../languageModelProviders/openai/legacy/ProcessFunctionCalls"
import { getOpenAICompletion } from "../languageModelProviders/openai/utils/openAiHelper"
import { Enums, Tables } from "types/supabase"
import { GetSystemStartPrompt } from "@/twilio/SystemPrompt"
import { logFoodItemStream } from "@/foodMessageProcessing/logFoodItemExtract/logFoodItemStreamChat"
import { logFoodItemStreamWithImages } from "@/foodMessageProcessing/logFoodItemWithImageExtract/logFoodItemWithImageStreamChat"
import { i } from "mathjs"
import { softDeleteLoggedFoodItemsByMessageId } from "./common/deleteAssociatedMessageFoodItems"
import { getMessageTimeChat } from "./messageTime/extractMessageTime"
import { get } from "underscore"

const ROLE_MAPPING = {
  User: "user" as ChatCompletionRole,
  System: "system" as ChatCompletionRole,
  Assistant: "assistant" as ChatCompletionRole,
  Function: "function" as ChatCompletionRole
}
type ResponseForUser = {
  resultMessage: string
  responseToFunctionName?: string
  status?: Enums<"MessageStatus">
  itemsProcessed?: number
  itemsToProcess?: number
  warning?: string
}

// Define a mapping from function_call name to MessageType enum
const functionToMessageTypeMap: { [key: string]: Enums<"MessageType"> } = {
  log_food_items: "FOOD_LOG_REQUEST",
  show_daily_food: "SHOW_FOOD_LOG",
  log_exercise: "LOG_EXERCISE",
  update_user_info: "UPDATE_USER_INFO"
}

/*
Loads the messages for the user and gets a new response from OpenAI
*/
export async function GenerateResponseForUser(user: Tables<"User">): Promise<ResponseForUser> {
  // Get messages
  const messages: any = [
    {
      role: ROLE_MAPPING.System,
      content: GetSystemStartPrompt(user)
    }
  ]

  // Get user messages
  const messagesForUser = await GetMessagesForUser(user.id)

  // Get the id of last message from user
  const lastUserMessage = messagesForUser
    .slice()
    .reverse()
    .find((message) => message.role === "User") as Tables<"Message">

  UpdateMessage({ id: lastUserMessage.id, status: "PROCESSING" })

  let prevMessage: OpenAI.ChatCompletionMessageParam | undefined = undefined
  const tempProcessedMessage: OpenAI.ChatCompletionAssistantMessageParam = {
    role: "assistant",
    content: "ok! got it."
  }
  for (const message of messagesForUser) {
    let msg: OpenAI.ChatCompletionMessageParam = {
      role: ROLE_MAPPING[message.role],
      content: message.content,
      ...(message.role === "Function" && { name: message.function_name })
    } as OpenAI.ChatCompletionMessageParam
    if (message.function_name && msg.role === "function") {
      ;(msg as OpenAI.ChatCompletionFunctionMessageParam).name = message.function_name
    }
    // Check if the message ID matches and the user's first name is not known or is an empty string
    // if (message.id === lastUserMessage.id && (!user.firstName || user.firstName.trim() === "")) {
    //   msg.content +=
    //     "\nIf you don't know my name as for it. Be sure to call update_user_info whenever I tell you my name."
    // }

    // We don't want to send two user messages in a row, so we add a temp message in between that says the previous message was processed.
    if (prevMessage && prevMessage.role === ROLE_MAPPING.User && msg.role === ROLE_MAPPING.User) {
      messages.push(tempProcessedMessage)
    }
    messages.push(msg)
    prevMessage = msg
  }

  console.log("messages", messages)

  /* models
  gpt-3.5-turbo-0613
  gpt-4-0613
  */

  const modelName = "gpt-3.5-turbo-0613"

  const gptRequest = {
    model: modelName,
    messages,
    functions: [
      {
        name: "log_food_items",
        // description: "Call this function to log food items when the user says what they ate.",
        parameters: logFoodSchema
      },
      {
        name: "show_daily_food",
        // description: "Call this function when the user asks what they ate today.",
        parameters: showDailyFoodSummarySchema
      },
      {
        name: "update_user_info",
        // description: "Call this function when the user tells you their name.",
        parameters: updateUserInfoSchema
      },
      {
        name: "log_exercise",
        // description: "Call this function to log user reported exercise.",
        parameters: logExerciseSchema
      }
    ],
    function_call: "auto",
    temperature: 0.0
  }

  const maxRetries = 1 // You can adjust this value as needed.

  const completion = await getOpenAICompletion(gptRequest, user, maxRetries, "gpt-4-0613", 0.1)

  // Check if there was a successful completion
  if (!completion) {
    UpdateMessage({
      id: lastUserMessage.id,
      status: "FAILED",
      resolvedAt: new Date()
    })
    return {
      resultMessage: "Sorry, We're having problems right now. Please try again later."
    }
  }

  let messageForUser = ""
  let responseToFunction

  if (completion?.data.choices[0]) {
    console.log("completion choices: ", completion.data.choices[0])

    const functionCall = completion.data.choices[0].message?.function_call

    // We should call a function
    if (functionCall) {
      const messageType = functionToMessageTypeMap[functionCall.name]
      UpdateMessage({ id: lastUserMessage.id, messageType: messageType })

      messageForUser = await ProcessFunctionCalls(user, functionCall, lastUserMessage.id)
      responseToFunction = functionCall.name

      // We should call just return a message
    } else {
      messageForUser = completion?.data.choices[0].message?.content || "Sorry, I don't understand. Can you try again?"
      UpdateMessage({
        id: lastUserMessage.id,
        status: "RESOLVED",
        resolvedAt: new Date()
      })
    }
  } else {
    messageForUser =
      "Sorry, we're having problems right now. Please try again later. Could not parse the response from OpenAI."
    console.log("Data is not available")
    UpdateMessage({
      id: lastUserMessage.id,
      status: "FAILED",
      resolvedAt: new Date()
    })
    return {
      resultMessage: messageForUser
    }
  }

  return {
    resultMessage: messageForUser,
    responseToFunctionName: responseToFunction
  }
}

// Extract first, then publish the complete expected count before any queue job
// can finish. Pending and failed matches are never reported as successful meals.
export async function GenerateResponseForQuickLog(
  user: Tables<"User">,
  inputMessageId: number,
  consumedOn: string = new Date().toISOString(),
  isMessageBeingEdited: boolean = false
): Promise<ResponseForUser> {
  const loadedMessage = await GetMessageById(inputMessageId)
  if (!loadedMessage || loadedMessage.userId !== user.id || loadedMessage.deletedAt) {
    throw new Error("Message is unavailable")
  }
  if (!Number.isFinite(new Date(consumedOn).getTime())) throw new Error("Invalid consumedOn")
  if (!isMessageBeingEdited && ["RESOLVED", "PROCESSING", "FAILED"].includes(loadedMessage.status)) {
    return { resultMessage: "Message has already been submitted. Check its food items before retrying.",
      status: loadedMessage.status, itemsProcessed: loadedMessage.itemsProcessed ?? 0,
      itemsToProcess: loadedMessage.itemsToProcess ?? 0 }
  }
  if (isMessageBeingEdited) await softDeleteLoggedFoodItemsByMessageId(inputMessageId)
  await UpdateMessage({ id: inputMessageId, status: "PROCESSING", consumedOn: new Date(consumedOn),
    itemsToProcess: 0, itemsProcessed: 0 })

  // Attach the rejection handler immediately, even if extraction later fails.
  // Time inference is optional; the caller already supplied a valid timestamp.
  let warning: string | undefined
  const timePromise = isMessageBeingEdited ? Promise.resolve(null) :
    getMessageTimeChat(user, loadedMessage.content).catch(() => {
      console.error("Quick log time inference failed", { messageId: inputMessageId })
      warning = "Used the selected meal time because automatic time detection failed."
      return null
    })
  let foodItemsToLog: FoodItemToLog[]
  let isBadFoodLogRequest: boolean
  try {
    const result = loadedMessage.hasimages
      ? await logFoodItemStreamWithImages(user, loadedMessage, new Date(consumedOn))
      : await logFoodItemStream(user, loadedMessage, new Date(consumedOn))
    ;({ foodItemsToLog, isBadFoodLogRequest } = result)
  } catch (error) {
    await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date() })
    throw error
  }
  if (!foodItemsToLog.length) {
    await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date(), isBadFoodLogRequest: true })
    return { resultMessage: "Could not identify any food items.", status: "FAILED", itemsProcessed: 0, itemsToProcess: 0 }
  }
  const inferred = await timePromise
  const inferredDate = inferred?.timeWasSpecified ? inferred.consumedDateTime : null
  const mealTime = inferredDate && Number.isFinite(inferredDate.getTime()) ? inferredDate : new Date(consumedOn)
  await UpdateMessage({ id: inputMessageId, itemsToProcess: foodItemsToLog.length,
    consumedOn: mealTime, isBadFoodLogRequest })
  const queued = await Promise.allSettled(foodItemsToLog.map(async (food, index) => {
    food.timeEaten = new Date(mealTime.getTime() + index * 10).toISOString()
    const result = await AddLoggedFoodItemToQueue(user, loadedMessage, food, index)
    food.database_id = result.loggedFoodItemId
  }))
  if (queued.some(result => result.status === "rejected")) {
    await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date() })
  }
  const progress = await refreshFoodMessageProgress(inputMessageId)
  return {
    resultMessage: progress.status === "RESOLVED" ? "All food items were logged successfully." :
      progress.status === "FAILED" ? "Some food items could not be logged. Review the saved items before retrying." :
      "Food items submitted and still processing.",
    status: progress.status,
    itemsProcessed: progress.itemsProcessed ?? 0,
    itemsToProcess: progress.itemsToProcess ?? 0,
    ...(warning ? { warning } : {})
  }
}
