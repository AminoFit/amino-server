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

type ResponseForUser = {
  resultMessage: string;
  responseToFunctionName?: string;
};

/*
Loads the messages for the user and gets a new response from OpenAI
*/
export async function GenerateResponseForUser(
  user: User
): Promise<ResponseForUser> {
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: GetSystemStartPrompt(user),
    },
  ];

  const messagesForUser = await GetMessagesForUser(user.id);

  messagesForUser.forEach((message) => {
    let role: ChatCompletionRequestMessageRoleEnum =
      ChatCompletionRequestMessageRoleEnum.User;
    if (message.role === Role.User) {
      role = ChatCompletionRequestMessageRoleEnum.User;
    }
    if (message.role === Role.System) {
      role = ChatCompletionRequestMessageRoleEnum.System;
    }
    if (message.role === Role.Assistant) {
      role = ChatCompletionRequestMessageRoleEnum.Assistant;
    }
    if (message.role === Role.Function) {
      role = ChatCompletionRequestMessageRoleEnum.Function;
    }

    const msg: ChatCompletionRequestMessage = {
      role,
      content: message.content,
    };
    if (message.function_name) {
      msg.name = message.function_name;
    }
    messages.push(msg);
  });

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
    temperature: 1,
  };

  const completion = await openai
    .createChatCompletion(gptRequest)
    .catch((err) => {
      console.log(
        "Error getting req from OpenAi",
        err.message,
        err.response.data
      );
      NextResponse.json({ error: err.message });
    });

  if (!completion) {
    return {
      resultMessage:
        "Sorry, We're having problems right now. Please try again later.",
    };
  }

  if (completion?.data.usage) {
    await LogOpenAiUsage(user, completion.data.usage, modelName);
  } else {
    return {
      resultMessage:
        "Sorry, we can't read some of the data from OpenAI. Please try again later.",
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
