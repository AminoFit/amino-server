import { NextRequest, NextResponse } from "next/server"
import { deleteUserAndData } from "@/utils/supabase/deleteUserAndData"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"

export async function POST(request: NextRequest) {
  console.log("User Deletion Request")

  // Authenticate and get the user
  const { aminoUser, error } = await GetAminoUserOnRequest()

  if (error) {
    return new Response(error, { status: 400 })
  }

  if (!aminoUser) {
    return new Response("No amino user found", { status: 400 })
  }

  // Perform the deletion process
  const deletionResult = await deleteUserAndData(aminoUser.id)

  return NextResponse.json(deletionResult)
}