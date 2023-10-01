import { signIn } from "next-auth/react"
import { NextResponse } from "next/server"

export async function GET() {
  console.log("got a GET request")
  return NextResponse.json({ text: "get ok" })
}

export async function POST(request: Request) {
  console.log("got a POST request for send-magic-link")
  const formData = await request.json()
  // const phone = formData.get("phone") as string;
  console.log("formData", formData)
  const email = formData.email

  if (!email) {
    return NextResponse.json({ error: "Missing 'email' data" })
  }

  console.log("found email", email)
  signIn("email", { email })

  return new Response("Unknown", { status: 200 })
}
