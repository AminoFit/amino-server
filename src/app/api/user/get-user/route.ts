export const dynamic = "force-dynamic"

import { getUser } from "@/app/dashboard/settings/actions"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  const user = await getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }

  return NextResponse.json(user)
}
