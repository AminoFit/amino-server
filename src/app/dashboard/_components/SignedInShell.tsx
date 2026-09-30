import type { ReactNode } from "react"
import { AppShell } from "@/components/AppShell"
import { createClient } from "@/utils/supabase/server"
import { TopBar } from "./TopBar"

/** The layout of the signed-in pages: theme and top bar. The bar's name comes from the session cookie (no network
 * call), so it shows at once, with the page's own loading skeleton, while the page's data loads. */
export async function SignedInShell({ children }: { children: ReactNode }) {
  const { data: { session } } = await createClient().auth.getSession()
  const meta = (session?.user.user_metadata ?? {}) as { full_name?: string; name?: string }
  return (
    <AppShell>
      <TopBar name={meta.full_name ?? meta.name} email={session?.user.email} />
      {children}
    </AppShell>
  )
}
