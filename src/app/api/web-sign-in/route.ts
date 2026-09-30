import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { SIGN_IN_COOKIE, pickUpSignIn } from "@/utils/webSignIn"

// The sign-in page polls this while the user approves on their phone. Once approved, the one-time token becomes this
// browser's session (the Supabase cookies are set on this response).
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const result = await pickUpSignIn(cookies().get(SIGN_IN_COOKIE)?.value)
    if (result.status === "waiting") return NextResponse.json({ status: "waiting" })
    cookies().delete(SIGN_IN_COOKIE)
    if (result.status !== "approved") return NextResponse.json({ status: result.status })
    const { error } = await createClient().auth.verifyOtp({ token_hash: result.tokenHash, type: "magiclink" })
    if (error) {
      console.error("web_sign_in_verify_failed", error)
      return NextResponse.json({ status: "failed" })
    }
    return NextResponse.json({ status: "signed_in" })
  } catch (error) {
    console.error("web_sign_in_poll_failed", error)
    return NextResponse.json({ status: "waiting" })
  }
}
