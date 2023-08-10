import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse("Only POST allowed", {
    status: 400
  })
}

export async function POST(request: Request) {
  console.log("got a POST request")

  const jsonData = await request.json()

  console.log("Need to process the following food jsonData", jsonData)
  
  return NextResponse.json({ text: "get ok" })
}
