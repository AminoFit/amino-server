import GetMessagesForUser from "@/database/GetMessagesForUser"
import { GetSystemStartPrompt } from "@/twilio/SystemPrompt"
import UpdateMessage from "@/database/UpdateMessage"
import {
  logExerciseSchema,
  logFoodSchema,
  showDailyFoodSummarySchema,
  updateUserInfoSchema
} from "@/utils/openaiFunctionSchemas"
import { Message, Role, User, MessageStatus, MessageType } from "@prisma/client"
import { getOpenAICompletion } from "./utils/openAiHelper"
import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum
} from "openai"
import { ProcessFunctionCalls } from "./ProcessFunctionCalls"

const ROLE_MAPPING = {
  [Role.User]: ChatCompletionRequestMessageRoleEnum.User,
  [Role.System]: ChatCompletionRequestMessageRoleEnum.System,
  [Role.Assistant]: ChatCompletionRequestMessageRoleEnum.Assistant,
  [Role.Function]: ChatCompletionRequestMessageRoleEnum.Function
}
type ResponseForUser = {
  resultMessage: string
  responseToFunctionName?: string
}

// Define a mapping from function_call name to MessageType enum
const functionToMessageTypeMap: { [key: string]: MessageType } = {
  log_food_items: MessageType.FOOD_LOG_REQUEST,
  show_daily_food: MessageType.SHOW_FOOD_LOG,
  log_exercise: MessageType.LOG_EXERCISE,
  update_user_info: MessageType.UPDATE_USER_INFO
}

/*
Loads the messages for the user and gets a new response from OpenAI
*/
export async function GenerateResponseForUser(
  user: User
): Promise<ResponseForUser> {
  // Get messages
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: GetSystemStartPrompt(user)
    }
  ]

  // Get user messages
  const messagesForUser = await GetMessagesForUser(user.id)

  // Get the id of last message from user
  const lastUserMessage = messagesForUser
    .slice()
    .reverse()
    .find((message) => message.role === "User") as Message

  UpdateMessage({ id: lastUserMessage.id, status: MessageStatus.PROCESSING })

  let prevMessage: ChatCompletionRequestMessage | undefined = undefined
  const tempProcessedMessage: ChatCompletionRequestMessage = {
    role: ROLE_MAPPING.Assistant,
    content: "ok! got it."
  }
  for (const message of messagesForUser) {
    let msg: ChatCompletionRequestMessage = {
      role: ROLE_MAPPING[message.role],
      content: message.content
    }
    if (message.function_name) msg.name = message.function_name

    // Check if the message ID matches and the user's first name is not known or is an empty string
    if (
      message.id === lastUserMessage.id &&
      (!user.firstName || user.firstName.trim() === "")
    ) {
      msg.content +=
        "\nIf you don't know my name as for it. Be sure to call update_user_info whenever I tell you my name."
    }

    // We don't want to send two user messages in a row, so we add a temp message in between that says the previous message was processed.
    if (
      prevMessage &&
      prevMessage.role === ROLE_MAPPING.User &&
      msg.role === ROLE_MAPPING.User
    ) {
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

  const completion = await getOpenAICompletion(
    gptRequest,
    user,
    maxRetries,
    "gpt-4-0613",
    0.1
  )

  // Check if there was a successful completion
  if (!completion) {
    UpdateMessage({
      id: lastUserMessage.id,
      status: MessageStatus.FAILED,
      resolvedAt: new Date()
    })
    return {
      resultMessage:
        "Sorry, We're having problems right now. Please try again later."
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

      messageForUser = await ProcessFunctionCalls(
        user,
        functionCall,
        lastUserMessage
      )
      responseToFunction = functionCall.name

      // We should call just return a message
    } else {
      messageForUser =
        completion?.data.choices[0].message?.content ||
        "Sorry, I don't understand. Can you try again?"
      UpdateMessage({
        id: lastUserMessage.id,
        status: MessageStatus.RESOLVED,
        resolvedAt: new Date()
      })
    }
  } else {
    messageForUser =
      "Sorry, we're having problems right now. Please try again later. Could not parse the response from OpenAI."
    console.log("Data is not available")
    UpdateMessage({
      id: lastUserMessage.id,
      status: MessageStatus.FAILED,
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
