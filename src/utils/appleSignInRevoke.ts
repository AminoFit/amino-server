import { SignJWT, importPKCS8 } from "jose"

// Sign in with Apple token revocation (App Review 5.1.1(v)): deleting an account must also revoke the user's Apple
// tokens. The app sends a fresh authorization code from Sign in with Apple; this exchanges it for tokens and revokes
// them. Needs a Sign in with Apple key: APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY (the .p8 PEM) and APPLE_TEAM_ID.
// Best effort: without the key, or when Apple refuses, it only logs, and the account is deleted anyway.

const CLIENT_ID = "fit.amino"
const APPLE = "https://appleid.apple.com"

/** The client secret Apple expects: an ES256 JWT from the team, about the app, valid for five minutes. */
async function clientSecret(keyId: string, teamId: string, pem: string) {
  // Vercel env values often hold the PEM on one line with literal "\n".
  const key = await importPKCS8(pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem, "ES256")
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId }).setIssuer(teamId).setAudience(APPLE)
    .setSubject(CLIENT_ID).setIssuedAt().setExpirationTime("5m").sign(key)
}

async function post(path: string, form: Record<string, string>) {
  const response = await fetch(`${APPLE}${path}`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : {}
}

/** Exchanges the authorization code and revokes the refresh token (or the access token when there is none). Never
 * throws; returns whether Apple confirmed the revocation. */
export async function revokeAppleSignIn(authorizationCode: string): Promise<boolean> {
  const keyId = process.env.APPLE_SIWA_KEY_ID, pem = process.env.APPLE_SIWA_PRIVATE_KEY, teamId = process.env.APPLE_TEAM_ID
  if (!keyId || !pem || !teamId) {
    console.log("Sign in with Apple revocation skipped: APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY or APPLE_TEAM_ID is not set")
    return false
  }
  try {
    const secret = await clientSecret(keyId, teamId, pem)
    const tokens: { refresh_token?: string; access_token?: string } = await post("/auth/token", { client_id: CLIENT_ID,
      client_secret: secret, code: authorizationCode, grant_type: "authorization_code" })
    const [token, hint] = tokens.refresh_token ? [tokens.refresh_token, "refresh_token"] : [tokens.access_token, "access_token"]
    if (!token) throw new Error("/auth/token returned no token")
    await post("/auth/revoke", { client_id: CLIENT_ID, client_secret: secret, token, token_type_hint: hint })
    console.log("Sign in with Apple tokens revoked")
    return true
  } catch (error) {
    console.error("Sign in with Apple revocation failed", error)
    return false
  }
}
