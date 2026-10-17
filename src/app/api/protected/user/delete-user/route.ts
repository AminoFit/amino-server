import { NextRequest, NextResponse } from "next/server"
import { deleteUserAndData } from "@/utils/supabase/deleteUserAndData"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { revokeAppleSignIn } from "@/utils/appleSignInRevoke"

/** The optional JSON body: for an account linked to Sign in with Apple, a fresh authorization code, so its Apple
 * tokens are revoked before the account goes (App Review 5.1.1(v)). A request without a body deletes as before. */
async function appleAuthorizationCode(request: NextRequest): Promise<string | null> {
  const text = await request.text().catch(() => "")
  if (!text.trim()) return null
  try {
    const code = JSON.parse(text)?.appleAuthorizationCode
    return typeof code === "string" && code.length > 0 && code.length < 2048 ? code : null
  } catch {
    return null
  }
}

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

  // Revocation never blocks deletion: revokeAppleSignIn logs and moves on when the key is missing or Apple refuses.
  const code = await appleAuthorizationCode(request)
  if (code) await revokeAppleSignIn(code)

  // Perform the deletion process
  const deletionResult = await deleteUserAndData(aminoUser.id)

  // A failure is an error status: the app shows "Account deleted" whenever the response is ok.
  return NextResponse.json(deletionResult, { status: "error" in deletionResult ? 500 : 200 })
}