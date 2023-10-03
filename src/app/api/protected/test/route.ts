import { NextRequest, NextResponse } from "next/server"


const GET = async (req: NextRequest) => {
  const message = {
    text: "This is a protected message.",
    user: req.headers.get("x-amino-user")
  }
  console.log("got a GET request in protected")
  console.log("Message:", message)
  return NextResponse.json(message)
}

export { GET }
