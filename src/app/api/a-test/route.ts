export const runtime = "nodejs"

import { getSession } from "@auth0/nextjs-auth0"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest, res: NextResponse) {
  const session = await getSession()
  console.log("Session", session)

  console.log("Here")

  return Response.json({ message: "Success" })
}
