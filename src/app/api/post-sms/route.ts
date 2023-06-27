import GetOrCreateUser from "@/database/GetOrCreateUser";
import SaveMessageFromUser from "@/database/SaveMessageFromUser";
import { GenerateResponseForUser } from "@/openai/RespondToMessage";
import { SaveAndSendMessageToUser } from "@/twilio/SendMessageToUser";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  console.log("got a GET request");
  return NextResponse.json({ text: "get ok" });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const fromPhone = formData.get("From") as string;
  const body = formData.get("Body") as string;

  if (!fromPhone) {
    return NextResponse.json({ error: "Missing form 'From' data" });
  }

  if (!body) {
    return NextResponse.json({ error: "Missing form 'Body' data" });
  }

  const user = await GetOrCreateUser(fromPhone);
  console.log("user", user);
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

    const newMessage = await SaveMessageFromUser(
      user,
      newResponseMessage.resultMessage || "",
      Role.Assistant
    );
    await SaveAndSendMessageToUser(user, newMessage.content);
  } else {
    await SaveAndSendMessageToUser(user, responseMessage.resultMessage);
  }
  return NextResponse.json({ message: "Success" });
}
