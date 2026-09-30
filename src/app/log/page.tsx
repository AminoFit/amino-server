import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { SignedOut, loadDashboard } from "@/app/dashboard/_lib/data"
import { isDay } from "@/app/dashboard/_lib/dates"
import type { Dashboard } from "@/app/dashboard/_lib/types"
import { LogView } from "@/app/dashboard/_components/LogView"

// A signed-in user's food log on the web: a day at a time with their goals and stats. Read-only; logging happens in
// the app. Connected agents and appearance are on /settings.
export const dynamic = "force-dynamic"

export default async function LogPage({ searchParams }: { searchParams: { day?: string } }) {
  const day = isDay(searchParams.day) ? searchParams.day : null
  const signIn = `/login?next=${encodeURIComponent(day ? `/log?day=${day}` : "/log")}`
  // The middleware has just checked the session with Supabase; the reads below verify its token again.
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) redirect(signIn)

  let dashboard: Dashboard
  try {
    dashboard = await loadDashboard(day)
  } catch (error) {
    // The token was refused although a session cookie exists: sign in again rather than bounce between the pages.
    if (error instanceof SignedOut) redirect(`${signIn}&session=expired`)
    throw error
  }
  return <LogView initial={dashboard} loadedAt={Date.now()} />
}
