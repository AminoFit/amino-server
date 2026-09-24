import { cookies } from "next/headers"
import { createAdminSupabase } from "./serverAdmin"

/** Serving changes only need verified identity. The owned LoggedFoodItem row
 * has a foreign key to User, so loading the full profile adds no authorization. */
export async function GetUserIdOnRequest(): Promise<{ userId?: string; error?: string }> {
  const token = cookies().get("sb-localhost-auth-token")?.value
  if (!token) return { error: "No token provided" }
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user) return { error: error?.message ?? "Invalid session" }
  return { userId: data.user.id }
}
