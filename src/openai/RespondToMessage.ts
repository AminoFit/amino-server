import GetMessagesForUser from "@/database/GetMessagesForUser";
import SaveMessageFromUser from "@/database/SaveMessageFromUser";
import { SendMessageToUser } from "@/twilio/SendMessageToUser";
import { GetSystemStartPrompt } from "@/twilio/SystemPrompt";
import {
  logExerciseSchema,
  logFoodSchema,
  openai,
  showDailyFoodSummarySchema,
  updateUserInfoSchema,
} from "@/utils/openaiFunctionSchemas";
import { Role, User } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  CreateCompletionResponseUsage,
} from "openai";
import { ProcessFunctionCalls } from "./ProcessFunctionCalls";
import { prisma } from "@/database/prisma";
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface";

const ROLE_MAPPING = {
  [Role.User]: ChatCompletionRequestMessageRoleEnum.User,
  [Role.System]: ChatCompletionRequestMessageRoleEnum.System,
  [Role.Assistant]: ChatCompletionRequestMessageRoleEnum.Assistant,
  [Role.Function]: ChatCompletionRequestMessageRoleEnum.Function,
};
type ResponseForUser = {
  resultMessage: string;
  responseToFunctionName?: string;
};

/*
Loads the messages for the user and gets a new response from OpenAI
*/
export async function GenerateResponseForUser(user: User): Promise<ResponseForUser> {
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: GetSystemStartPrompt(user),
    },
  ];

  const messagesForUser = await GetMessagesForUser(user.id);

  for (const message of messagesForUser) {
    const msg: ChatCompletionRequestMessage = {
      role: ROLE_MAPPING[message.role],
      content: message.content,
    };
    if (message.function_name) msg.name = message.function_name;
    messages.push(msg);
  }

  console.log("messages", messages);

  /* models
  gpt-3.5-turbo-0613
  gpt-4-0613
  */

  const modelName = "gpt-3.5-turbo-0613";

  const gptRequest = {
    model: modelName,
    messages,
    functions: [
      { name: "log_food_items", parameters: logFoodSchema },
      { name: "show_daily_food", parameters: showDailyFoodSummarySchema },
      { name: "log_exercise", parameters: logExerciseSchema },
      { name: "update_user_info", parameters: updateUserInfoSchema },
    ],
    function_call: "auto",
    temperature: 0.05,
  };

  const maxRetries = 1;  // You can adjust this value as needed.
  let retries = 0;
  let completion;

  while (retries < maxRetries) {
    try {
      // get completion from OpenAI
      completion = await openai.createChatCompletion(gptRequest);

      // log the usage
      if (completion?.data.usage) {
        await LogOpenAiUsage(user, completion.data.usage, gptRequest.model);
      } else {
        return {
          resultMessage:
            "Sorry, we can't read some of the data from OpenAI. Please try again later.",
        };
      }

      // Ensure output looks good
      if (checkOutput(completion)) break; 

    } catch (err) {
      const error = err as { message: string; response?: { data: any } };
      console.error("Error getting req from OpenAi", error.message, error.response?.data);
    }

    // Adjust parameters for next retry to a better model.
    if (retries === 0) {  // This checks for the first try.
      gptRequest.model = "gpt-4-0613";
      gptRequest.temperature = 0.1;
    }
    retries++;
  }

  if (!completion || retries === maxRetries) {
    return {
      resultMessage: "Sorry, We're having problems right now. Please try again later.",
    };
  }

  let messageForUser = "";
  let responseToFunction;

  if (completion?.data.choices[0]) {
    console.log("completion choices: ", completion.data.choices[0]);

    const functionCall = completion.data.choices[0].message?.function_call;

    // We should call a function
    if (functionCall) {
      messageForUser = await ProcessFunctionCalls(user, functionCall);
      responseToFunction = functionCall.name;

      // We should call just return a message
    } else {
      messageForUser =
        completion?.data.choices[0].message?.content ||
        "Sorry, I don't understand. Can you try again?";
    }
  } else {
    messageForUser =
      "Sorry, we're having problems right now. Please try again later. Could not parse the response from OpenAI.";
    console.log("Data is not available");
  }


  return {
    resultMessage: messageForUser,
    responseToFunctionName: responseToFunction,
  };
}

function checkOutput(completion: any): boolean {
  if (completion?.data.choices[0]) {
    const functionCall = completion.data.choices[0].message?.function_call;

    if (functionCall) {
      const parameters = JSON.parse(functionCall.arguments);
      if (functionCall.name === "log_food_items") {
        const foodItems: FoodItemToLog[] = parameters.food_items;

        // Check if any food item has total_serving_grams as 0 and serving_amount is non-zero
        for (const item of foodItems) {
          if (
            item.serving.total_serving_grams === 0 &&
            item.serving.serving_amount !== 0
          ) {
            return false;  // This means the completion is not valid
          }
        }
      }
    } 
  }
  return true;  // Default to true if no issues are found
}

async function LogOpenAiUsage(
  user: User,
  usage: CreateCompletionResponseUsage,
  modelName: string
) {
  console.log(`This request used ${usage.total_tokens || "??"} tokens`);
  const data = {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    userId: user.id,
    modelName,
  };
  return await prisma.openAiUsage.create({
    data,
  });
}