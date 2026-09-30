import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto"
import { createAdminSupabase } from "./supabase/serverAdmin"

// Signing in on the web by scanning a code with the app (most users sign in with Apple on the phone and have no web
// password). The sign-in page starts a request and shows its QR code; the app, signed in, shows who is asking and has
// the user pick the number on the computer's screen; the server then makes a one-time sign-in token for that user
// (a magic link's token, never sent anywhere) and hands it only to the browser holding the request's secret cookie.
// Picking the number means someone can't get a person to approve a code they didn't start.

export const SIGN_IN_COOKIE = "amino-web-sign-in"
export const SIGN_IN_LIFETIME_MS = 5 * 60_000
const SIGN_IN_ID = /^[A-Za-z0-9_-]{24}$/

export const isSignInId = (id: unknown): id is string => typeof id === "string" && SIGN_IN_ID.test(id)

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const db = () => createAdminSupabase() as any
const cutoff = () => new Date(Date.now() - SIGN_IN_LIFETIME_MS).toISOString()

/** "Chrome on macOS", from the user agent. */
export function describeBrowser(userAgent: string | null) {
  const ua = userAgent ?? ""
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser"
  const system = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null
  return system ? `${browser} on ${system}` : browser
}

/** "Lisbon, PT" from Vercel's location headers, when present. */
export function describePlace(city: string | null, country: string | null) {
  let name = city ?? ""
  try { name = decodeURIComponent(name) } catch {}
  return [name, country].filter(Boolean).join(", ") || null
}

/** A new request for this browser. The cookie value (id.secret) goes in an httpOnly cookie. */
export async function startSignIn(browser: string, place: string | null) {
  const id = randomBytes(18).toString("base64url")
  const secret = randomBytes(32).toString("base64url")
  const code = String(randomInt(10, 100))
  await db().from("WebSignIn").delete().lt("createdAt", cutoff())
  const { error } = await db().from("WebSignIn").insert({ id, browserSecretHash: hash(secret), code, browser, place })
  if (error) throw error
  return { id, code, cookie: `${id}.${secret}` }
}

type Row = { id: string; browserSecretHash: string; code: string; browser: string | null; place: string | null
  status: "waiting" | "approved" | "denied"; userId: string | null; tokenHash: string | null; createdAt: string }

async function waitingRow(id: string): Promise<Row | null> {
  const { data, error } = await db().from("WebSignIn").select("*").eq("id", id).eq("status", "waiting")
    .gte("createdAt", cutoff()).maybeSingle()
  if (error) throw error
  return data
}

/** For the app: who is asking, and three numbers to pick from (one is on the computer's screen). */
export async function describeSignIn(id: string) {
  const row = await waitingRow(id)
  if (!row) return null
  const choices = new Set([row.code])
  while (choices.size < 3) choices.add(String(randomInt(10, 100)))
  const shuffled = [...choices]
  for (let i = shuffled.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
  return { browser: row.browser, place: row.place, createdAt: row.createdAt, choices: shuffled }
}

export type Decision = "approved" | "denied" | "wrong_code" | "expired" | "no_email"

/** The app's answer. A wrong number ends the request, so guessing doesn't work. */
export async function decideSignIn(id: string, userId: string, approve: boolean, code: unknown): Promise<Decision> {
  const row = await waitingRow(id)
  if (!row) return "expired"
  const deny = async () => {
    await db().from("WebSignIn").update({ status: "denied", decidedAt: new Date().toISOString() })
      .eq("id", id).eq("status", "waiting")
  }
  if (!approve) { await deny(); return "denied" }
  if (typeof code !== "string" || code !== row.code) { await deny(); return "wrong_code" }

  const admin = createAdminSupabase()
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError) throw userError
  const email = userData.user?.email
  if (!email) { await deny(); return "no_email" }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (linkError) throw linkError
  const tokenHash = link.properties?.hashed_token
  if (!tokenHash) throw new Error("web_sign_in_no_token")
  const { data: updated, error } = await db().from("WebSignIn")
    .update({ status: "approved", userId, tokenHash, decidedAt: new Date().toISOString() })
    .eq("id", id).eq("status", "waiting").select("id").maybeSingle()
  if (error) throw error
  return updated ? "approved" : "expired"
}

export type Pickup = { status: "waiting" | "expired" | "denied" } | { status: "approved"; tokenHash: string }

/** For the browser that started the request (its cookie): still waiting, or the one-time token, taken once. */
export async function pickUpSignIn(cookie: string | undefined): Promise<Pickup> {
  const [id, secret] = (cookie ?? "").split(".")
  if (!isSignInId(id) || !secret) return { status: "expired" }
  const { data: row, error } = await db().from("WebSignIn").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  if (!row) return { status: "expired" }
  const expected = Buffer.from(row.browserSecretHash, "hex"), given = Buffer.from(hash(secret), "hex")
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { status: "expired" }
  if (row.status === "waiting")
    return Date.parse(row.createdAt) >= Date.now() - SIGN_IN_LIFETIME_MS ? { status: "waiting" } : { status: "expired" }
  const { data: taken } = await db().from("WebSignIn").delete().eq("id", id).eq("status", row.status).select("tokenHash").maybeSingle()
  if (row.status === "denied" || !taken?.tokenHash) return { status: "denied" }
  return { status: "approved", tokenHash: taken.tokenHash }
}
