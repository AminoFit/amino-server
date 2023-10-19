import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  const session = await getServerSession()
  console.log(session)
  return NextResponse.json({
    session,
    token
  })
}
