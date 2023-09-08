import GetOrCreateUser from "@/database/GetOrCreateUser"
import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import { GenerateResponseForUser } from "@/openai/RespondToMessage"
import { SaveAndSendMessageToUser } from "@/twilio/SendMessageToUser"
import { Role } from "@prisma/client"
import { NextResponse } from "next/server"

export async function GET() {
  console.log("got a GET request")
  return NextResponse.json({ text: "get ok" })
}

export async function POST(request: Request) {
  const formData = await request.json()
  const phone = formData.phone
  // const phone = formData.get("phone") as string;
  console.log("formData", formData)

  // Validate phone number
  let validPhone = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im
  if (!validPhone.test(phone)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
  }

  const user = await GetOrCreateUser(phone)
  console.log("user", user)
  await SaveMessageFromUser(
    user,
    "The user just signed up on the website. Tell them how you can log foods and works. Tell them to give it a try.",
    Role.System
  )
  // const responseMessage = await GenerateResponseForUser(user);
  await SaveAndSendMessageToUser(
    user,
    "Welcome to Amino! We can log foods to your food log! Give it a try. What did you last eat?"
  )

  return NextResponse.json({ message: "Success" })
}
