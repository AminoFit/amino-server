import GetMessagesForUser from "@/database/GetMessagesForUser";
import GetOrCreateUser from "@/database/GetOrCreateUser";
import SaveMessageFromUser from "@/database/SaveMessageFromUser";
import { ProcessFunctionCalls } from "@/openai/ProcessFunctionCalls";
import { SendMessageToUser } from "@/twilio/SendMessageToUser";
import { SystemStartPrompt } from "@/twilio/SystemPrompt";
import {
  logExerciseSchema,
  logFoodSchema,
  openai,
  showDailyFoodSummarySchema,
} from "@/utils/openai";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from "openai";

export async function GET() {
  console.log("got a GET request");
  return NextResponse.json({ text: "get ok" });
}
export async function POST(request: Request) {
  const formData = await request.formData();
  const fromPhone = formData.get("From") as string;
  const message = formData.get("Body") as string;

  if (!fromPhone) {
    return NextResponse.json({ error: "no from phone" });
  }

  if (!message) {
    return NextResponse.json({ error: "no message" });
  }

  const user = await GetOrCreateUser(fromPhone);
  console.log("user", user);
  const newMessage = await SaveMessageFromUser(user, message, Role.User);
  console.log("newMessage", newMessage);

  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: SystemStartPrompt,
    },
  ];

  const messagesForUser = await GetMessagesForUser(user);

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

    messages.push({
      role,
      content: message.content,
    });
  });

  console.log("messages", messages);

  const gptRequest = {
    model: "gpt-3.5-turbo-0613",
    messages,
    functions: [
      { name: "log_food_items", parameters: logFoodSchema },
      { name: "show_daily_food", parameters: showDailyFoodSummarySchema },
      { name: "lot_exercise", parameters: logExerciseSchema },
    ],
    function_call: "auto",
    temperature: 0,
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
    return;
  }

  if (completion?.data.choices[0]) {
    console.log(completion.data.choices[0]);
    const functionCall = completion.data.choices[0].message?.function_call;
    if (functionCall) {
      await ProcessFunctionCalls(user, functionCall);
    } else {
      console.log(
        "could not find json to parse. Assume sending message back to user."
      );
      const messageBack =
        completion?.data.choices[0].message?.content ||
        "Sorry, I don't understand. Can you try again?";

      const savedMessage = await SaveMessageFromUser(
        user,
        messageBack,
        Role.Assistant
      );
      if (!savedMessage) {
        console.log("Error saving message from assistant");
      }
      const sentMessage = await SendMessageToUser(user, messageBack);
      if (!sentMessage) {
        console.log("Error sending message to user");
      }
    }
  } else {
    console.log("Data is not available");
  }
  console.log(
    `This request used ${completion.data.usage?.total_tokens || "??"} tokens`
  );

  // return NextResponse.json({ text: completion.data.choices[0] });
}
