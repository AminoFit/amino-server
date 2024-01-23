import { HandleLogFoodItems } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { HandleUpdateUserInfo } from "@/database/OpenAiFunctions/HandleUpdateUserInfo"
import UpdateMessage from "@/database/UpdateMessage"
import OpenAI from "openai"
import { Tables } from "types/supabase"

export const ProcessFunctionCalls = async (
  user: Tables<"User">,
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
    case "update_user_info":
      const user_info_reply = await HandleUpdateUserInfo(user, parameters)
      UpdateMessage({
        id: lastUserMessageId,
        status: "RESOLVED",
        resolvedAt: new Date()
      })
      return user_info_reply
  }
  return "Something went wrong. We could not find a function with that name."
}
