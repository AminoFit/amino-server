import SaveMessageFromUser from "@/database/SaveMessageFromUser";
import { GenerateResponseForUser } from "@/openai/RespondToMessage";
import {
  LogSmsMessage,
  SaveAndSendMessageToUser,
} from "@/twilio/SendMessageToUser";
import { MessageDirection, Role, User } from "@prisma/client";
import { NextResponse } from "next/server";

export default async function ProcessMessage(user: User, body: string) {
  await LogSmsMessage(user, body, MessageDirection.Inbound);

  await SaveMessageFromUser(user, body, Role.User);
  console.log("body", body);

  const responseMessage = await GenerateResponseForUser(user);

  if (responseMessage.responseToFunctionName) {
    // Save the message to the database
    await SaveMessageFromUser(
      user,
      responseMessage.resultMessage || "",
      Role.Function,
      responseMessage.responseToFunctionName
    );

    // Get a new response with that message now logged
    const newResponseMessage = await GenerateResponseForUser(user);

    await SaveAndSendMessageToUser(
      user,
      newResponseMessage.resultMessage || ""
    );
  } else {
    await SaveAndSendMessageToUser(user, responseMessage.resultMessage);
  }
  return NextResponse.json({ message: "Success" });
}
