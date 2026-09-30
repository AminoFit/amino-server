import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { SignedOut, loadDashboard } from "@/app/dashboard/_lib/data"
import type { Dashboard } from "@/app/dashboard/_lib/types"
import { StatsView } from "@/app/dashboard/_components/StatsPanel"
import { TopBar } from "@/app/dashboard/_components/TopBar"

// Trends from the last 12 weeks of the log. Server-rendered: every day in the charts links to its log.
export const dynamic = "force-dynamic"

export default async function StatsPage() {
  const signIn = "/login?next=/stats"
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) redirect(signIn)

  let data: Dashboard
  try {
    data = await loadDashboard(null, { photos: false })
  } catch (error) {
    if (error instanceof SignedOut) redirect(`${signIn}&session=expired`)
    throw error
  }
  return (
    <>
      <TopBar name={data.name} email={data.email} active="stats" />
      <StatsView data={data} />
    </>
  )
}
