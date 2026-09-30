import { cookies } from "next/headers"
import { createAdminSupabase } from "./serverAdmin"
import { oauthClaims } from "@/mcp/auth"

/** Serving changes only need verified identity. The owned LoggedFoodItem row
 * has a foreign key to User, so loading the full profile adds no authorization. */
export async function GetUserIdOnRequest(): Promise<{ userId?: string; error?: string }> {
  const token = cookies().get("sb-localhost-auth-token")?.value
  if (!token) return { error: "No token provided" }
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user) return { error: error?.message ?? "Invalid session" }
  return { userId: data.user.id }
}

/** The app's own session and its access token, for calls made as the user (the OAuth consent endpoints). A token an
 * agent got through OAuth is refused, so a connected agent can't approve or revoke connections itself. */
export async function GetAppSessionOnRequest(): Promise<{ userId?: string; token?: string; error?: string }> {
  const token = cookies().get("sb-localhost-auth-token")?.value
  if (!token) return { error: "No token provided" }
  if (oauthClaims(token)) return { error: "Agent sessions can't do this" }
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user) return { error: error?.message ?? "Invalid session" }
  return { userId: data.user.id, token }
}
