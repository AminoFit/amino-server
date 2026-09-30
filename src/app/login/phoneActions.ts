"use server"

import { cookies, headers } from "next/headers"
import { renderSVG } from "uqr"
import { SIGN_IN_COOKIE, SIGN_IN_LIFETIME_MS, describeBrowser, describePlace, startSignIn } from "@/utils/webSignIn"

/** Start signing in with the phone: a QR code for the app to scan and the number to pick there. */
export async function startPhoneSignIn() {
  const request = headers()
  const { id, code, cookie } = await startSignIn(describeBrowser(request.get("user-agent")),
    describePlace(request.get("x-vercel-ip-city"), request.get("x-vercel-ip-country")))
  cookies().set(SIGN_IN_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: SIGN_IN_LIFETIME_MS / 1000 })
  const host = request.get("x-forwarded-host") ?? request.get("host") ?? "www.amino.fit"
  return { code, qr: renderSVG(`https://${host}/signin/approve?id=${id}`, { border: 0 }), expiresInMs: SIGN_IN_LIFETIME_MS }
}
