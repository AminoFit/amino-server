import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // const token = await getToken({ req })
  // const session = await getServerSession()
  // console.log(session)
  // return NextResponse.json({
  //   session,
  //   token
  // })
  return NextResponse.json({ message: "Do stuff here" })
}
