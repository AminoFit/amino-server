import GetOrCreateUser from "@/database/GetOrCreateUser";
import { NextResponse } from "next/server";
import ProcessMessage from "../processMessage";

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

  return await ProcessMessage(user, body);
}
