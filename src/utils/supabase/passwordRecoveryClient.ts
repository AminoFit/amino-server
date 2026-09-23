import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const storageKey = "amino-password-recovery"
let recoveryClient: SupabaseClient | undefined

export function discardStoredPasswordRecoverySession() {
  window.sessionStorage.removeItem(storageKey)
}

export function getPasswordRecoveryClient() {
  if (!recoveryClient) {
    recoveryClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "implicit",
          detectSessionInUrl: false,
          autoRefreshToken: false,
          persistSession: true,
          storage: window.sessionStorage,
          storageKey,
        },
      }
    )
  }
  return recoveryClient
}

export async function clearPasswordRecoverySession() {
  try {
    await getPasswordRecoveryClient().auth.signOut({ scope: "local" })
  } finally {
    discardStoredPasswordRecoverySession()
  }
}
