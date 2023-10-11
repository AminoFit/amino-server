import { HandleLogExercise } from "@/database/OpenAiFunctions/HandleLogExercise"
import { HandleLogFoodItems } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { HandleUpdateUserInfo } from "@/database/OpenAiFunctions/HandleUpdateUserInfo"
import UpdateMessage from "@/database/UpdateMessage"
import { SendListOfFoodsTodayToUser } from "@/twilio/SendMessageToUser"
import { Message, MessageStatus, User } from "@prisma/client"
import OpenAI from "openai"

export const ProcessFunctionCalls = async (
  user: User,
  functionCall: OpenAI.Chat.ChatCompletionMessage.FunctionCall,
  lastUserMessageId: number
): Promise<string> => {
  const functionName = functionCall.name
  if (!functionCall.arguments) {
    return "We could not find any arguments for this function call."
  }
  const parameters = JSON.parse(functionCall.arguments)

  switch (functionName) {
    case "log_food_items":
      console.log("log_food_items", parameters)
      const resultMessage = await HandleLogFoodItems(user, parameters, lastUserMessageId)
      return resultMessage
    case "show_daily_food":
      const daily_food_reply = await SendListOfFoodsTodayToUser(user)
      UpdateMessage({
        id: lastUserMessageId,
        status: MessageStatus.RESOLVED,
        resolvedAt: new Date()
      })
      return daily_food_reply
    case "log_exercise":
      const exercise_reply = await HandleLogExercise(user, parameters)
      UpdateMessage({
        id: lastUserMessageId,
        status: MessageStatus.RESOLVED,
        resolvedAt: new Date()
      })
      return exercise_reply
    case "update_user_info":
      const user_info_reply = await HandleUpdateUserInfo(user, parameters)
      UpdateMessage({
        id: lastUserMessageId,
        status: MessageStatus.RESOLVED,
        resolvedAt: new Date()
      })
      return user_info_reply
  }
  return "Something went wrong. We could not find a function with that name."
}
