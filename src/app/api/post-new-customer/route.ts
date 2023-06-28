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
  const phone = formData.get("phone") as string;

  console.log("phone", phone);

  return NextResponse.json({ message: "Success" });
}
