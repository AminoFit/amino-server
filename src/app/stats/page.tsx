import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { SignedOut, loadDashboard, loadWeight } from "@/app/dashboard/_lib/data"
import type { Dashboard } from "@/app/dashboard/_lib/types"
import type { WeightData } from "@/app/dashboard/_lib/weight"
import { StatsView } from "@/app/dashboard/_components/StatsPanel"

// Trends from the last 12 weeks of the log, and the weight trend and expenditure. Server-rendered: every day in the
// calorie charts links to its log.
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
  // Weight is a card of its own: if it fails, the rest of the page still shows.
  const weight: WeightData | null = await loadWeight(session.user.id, data.today).catch(error => {
    console.error("stats_weight_failed", error)
    return null
  })
  return <StatsView data={data} weight={weight} />
}
