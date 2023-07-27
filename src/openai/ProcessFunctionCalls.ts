import { HandleLogExercise } from "@/database/OpenAiFunctions/HandleLogExercise"
import { HandleLogFoodItems, VerifyHandleLogFoodItems } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { HandleUpdateUserInfo } from "@/database/OpenAiFunctions/HandleUpdateUserInfo"
import { SendListOfFoodsTodayToUser } from "@/twilio/SendMessageToUser"
import { User } from "@prisma/client"
import { ChatCompletionRequestMessageFunctionCall } from "openai"

export const ProcessFunctionCalls = async (
  user: User,
  functionCall: ChatCompletionRequestMessageFunctionCall
): Promise<string> => {
  const functionName = functionCall.name
  if (!functionCall.arguments) {
    return "We could not find any arguments for this function call."
  }
  const parameters = JSON.parse(functionCall.arguments)

  switch (functionName) {
    case "log_food_items":
      console.log("log_food_items", parameters)
      const resultMessage = await HandleLogFoodItems(user, parameters)
      return resultMessage
    case "show_daily_food":
      return await SendListOfFoodsTodayToUser(user)
    case "log_exercise":
      return await HandleLogExercise(user, parameters)
    case "update_user_info":
      return await HandleUpdateUserInfo(user, parameters)
  }
  return "Something went wrong. We could not find a function with that name."
}
