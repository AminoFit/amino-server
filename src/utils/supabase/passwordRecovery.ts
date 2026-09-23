import type { SupabaseClient } from "@supabase/supabase-js"

type RecoveryAuth = SupabaseClient["auth"]
const invalidLink = "This reset link is invalid or has expired. Please request a new password reset email."

export function passwordRecoveryErrorMessage(error: unknown): string {
  const failure = error as { status?: number; message?: string } | null
  if (failure?.status === 429) return "Too many attempts. Please wait a few minutes and try again."
  if (/error sending recovery email/i.test(failure?.message ?? "")) {
    return "We couldn't send your reset email right now. Please try again later."
  }
  if (/failed to fetch|network request failed/i.test(failure?.message ?? "")) {
    return "Please check your connection and try again."
  }
  return failure?.message || "Something went wrong. Please try again."
}

export async function requestPasswordReset(auth: RecoveryAuth, email: string, origin: string) {
  const address = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter a valid email address.")
  const { error } = await auth.resetPasswordForEmail(address, {
    redirectTo: new URL("/password-change", origin).toString(),
  })
  if (error) throw error
}

export async function establishPasswordRecoverySession(auth: RecoveryAuth, url: URL) {
  const hash = new URLSearchParams(url.hash.slice(1))
  if ([hash, url.searchParams].some(params => params.has("error") || params.has("error_code"))) {
    throw new Error(invalidLink)
  }
  const access_token = hash.get("access_token")
  const refresh_token = hash.get("refresh_token")
  if (hash.has("access_token") || hash.has("refresh_token") || hash.has("type")) {
    if (!access_token || !refresh_token || hash.get("type") !== "recovery") throw new Error(invalidLink)
    const { data, error } = await auth.setSession({ access_token, refresh_token })
    if (error || !data.session) throw new Error(invalidLink)
    return
  }
  // Old PKCE links require the original browser's verifier. New recovery emails
  // use the implicit flow so links opened from the mobile app work on the web.
  if (url.searchParams.has("code")) throw new Error(invalidLink)
  // Only this tab's isolated recovery session can be reused after a reload.
  const { data, error } = await auth.getSession()
  if (error || !data.session) throw new Error(invalidLink)
}

export async function updateRecoveredPassword(auth: RecoveryAuth, password: string, confirmation: string) {
  if (password.length < 6) throw new Error("Use at least 6 characters for your new password.")
  if (password !== confirmation) throw new Error("Your passwords don't match.")
  const { data: sessionData, error: sessionError } = await auth.getSession()
  if (sessionError || !sessionData.session) throw new Error(invalidLink)
  const { data, error } = await auth.updateUser({ password })
  if (error) throw error
  if (!data.user) throw new Error("Your password could not be updated. Please try again.")
}
