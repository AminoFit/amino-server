import GetMessagesForUser from "@/database/GetMessagesForUser"
import { GetSystemStartPrompt } from "@/twilio/SystemPrompt"
import {
  logExerciseSchema,
  logFoodSchema,
  showDailyFoodSummarySchema,
  updateUserInfoSchema
} from "@/utils/openaiFunctionSchemas"
import { Message, Role, User } from "@prisma/client"
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

    // make it ask the user for their name
    if (message.id == lastUserMessage.id && !user.firstName) {
      msg.content += "\nAsk me for my name. You don't know it so don't assume any names."
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
      { name: "log_food_items", parameters: logFoodSchema },
      { name: "show_daily_food", parameters: showDailyFoodSummarySchema },
      { name: "log_exercise", parameters: logExerciseSchema },
      { name: "update_user_info", parameters: updateUserInfoSchema }
    ],
    function_call: "auto",
    temperature: 0.05
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
    }
  } else {
    messageForUser =
      "Sorry, we're having problems right now. Please try again later. Could not parse the response from OpenAI."
    console.log("Data is not available")
  }

  return {
    resultMessage: messageForUser,
    responseToFunctionName: responseToFunction
  }
}
