import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  // const token = await getToken({ req })
  // const jwt = req.cookies.get("next-auth.session-token")?.value
  // console.log({ jwt })
  // return NextResponse.redirect(new URL(`amino://SignIn/login?jwt=${jwt}`, req.url))
  return NextResponse.json({ message: "Do stuff here" })
}
