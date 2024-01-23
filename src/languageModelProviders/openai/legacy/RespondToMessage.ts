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
import { ProcessFunctionCalls } from "./ProcessFunctionCalls"
import { getOpenAICompletion } from "../utils/openAiHelper"
import { logFoodItemFunctionStream } from "../../../foodMessageProcessing/logFoodItemExtract/logFoodItemStreamFunction"
import { logFoodItemStreamInstruct } from "../../../foodMessageProcessing/logFoodItemExtract/logFoodItemStreamInstruct"
import { Enums, Tables } from "types/supabase"
import { GetSystemStartPrompt } from "@/twilio/SystemPrompt"

const ROLE_MAPPING = {
  User: "user" as ChatCompletionRole,
  System: "system" as ChatCompletionRole,
  Assistant: "assistant" as ChatCompletionRole,
  Function: "function" as ChatCompletionRole
}
type ResponseForUser = {
  resultMessage: string
  responseToFunctionName?: string
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
  const messages:any = [
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
    role: 'assistant',
    content: "ok! got it."
  }  
  for (const message of messagesForUser) {
    let msg: OpenAI.ChatCompletionMessageParam = {
      role: ROLE_MAPPING[message.role],
      content: message.content,
      ...(message.role === 'Function' && { name: message.function_name })
    } as OpenAI.ChatCompletionMessageParam;
    if (message.function_name && msg.role === "function") {
      (msg as OpenAI.ChatCompletionFunctionMessageParam).name = message.function_name;
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

// Helper function to handle error scenarios and update the message accordingly
function handleQuickLogError(inputMessageId: number, logMessage: string) {
  console.log("error",logMessage)
  UpdateMessage({
    id: inputMessageId,
    status: "FAILED",
    resolvedAt: new Date()
  })
}

// Utility function to generate a response for the user when they send a quick log food request
export async function GenerateResponseForQuickLog(
  user: Tables<"User">,
  inputMessageId: number
): Promise<ResponseForUser> {
  const loadedMessage = await GetMessageById(inputMessageId)
  if (!loadedMessage) {
    handleQuickLogError(inputMessageId, "Message is not available. Could not find the message.")
    return {
      resultMessage: "Sorry, we're having problems right now. Please try again later."
    }
  }

  //verify user is owner of message
  if (loadedMessage.userId !== user.id) {
    handleQuickLogError(inputMessageId, "Message is not available. User is not the owner of the message.")
    return {
      resultMessage: "Sorry, we're having problems right now. Please try again later."
    }
  }

  // if message is already resolved or processing, return
  if (loadedMessage.status === "RESOLVED" || loadedMessage.status === "PROCESSING") {
    return {
      resultMessage: "Message is already processed or processing."
    }
  }

  await UpdateMessage({
    id: inputMessageId,
    status: "PROCESSING",
  })


  let foodItemsToLog: FoodItemToLog[] = []

  try {
    // Try using the instruct model first
    foodItemsToLog = await logFoodItemStreamInstruct(user, loadedMessage.content, inputMessageId)
  } catch (error) {
    console.log("Error using instruct model:", error)

    // If an error occurs, fallback to the function stream method
    foodItemsToLog = await logFoodItemFunctionStream(user, loadedMessage.content, inputMessageId)
  }

  // Check if we have received any valid food items to log
  if (foodItemsToLog.length === 0) {
    return {
      resultMessage: "Sorry, I couldn't understand the food items you mentioned. Please try again."
    }
  }

  // Process the returned food items to generate a response message for the user
  const loggedFoodItems = foodItemsToLog.map((item) => item.food_database_search_name).join(", ")
  const messageForUser = `Successfully logged the following food items: ${loggedFoodItems}`

  // Update the message status as RESOLVED
  await UpdateMessage({
    id: inputMessageId,
    status: "RESOLVED",
    resolvedAt: new Date()
  })

  return {
    resultMessage: messageForUser
  }
}
