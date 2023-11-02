import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  // return NextResponse.redirect(new URL(`amino://SignIn/logout`, req.url));
  return NextResponse.json({ message: "Do stuff here" })
}
