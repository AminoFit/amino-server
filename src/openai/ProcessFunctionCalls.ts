import { HandleLogFoodItems } from "@/database/OpenAiFunctions/HandleLogFoodItems";
import {
  SaveAndSendMessageToUser,
  SendDailyMacrosToUser,
} from "@/twilio/SendMessageToUser";
import { User } from "@prisma/client";
import { ChatCompletionRequestMessageFunctionCall } from "openai";

export const ProcessFunctionCalls = async (
  user: User,
  functionCall: ChatCompletionRequestMessageFunctionCall
) => {
  const functionName = functionCall.name;
  if (!functionCall.arguments) {
    return "We could not find any arguments for this function call.";
  }
  const parameters = JSON.parse(functionCall.arguments);

  switch (functionName) {
    case "log_food_items":
      const resultMessage = await HandleLogFoodItems(user, parameters);
      if (!resultMessage) {
        await SaveAndSendMessageToUser(
          user,
          "Sorry, I could not log your food items. Please try again later."
        );
        return;
      }
      await SaveAndSendMessageToUser(user, resultMessage);
      await SendDailyMacrosToUser(user);
      return;
  }
};
