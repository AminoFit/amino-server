import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/20/solid"
import { createClient } from "@/utils/supabase/server"
import { THEME_COOKIE, themeFrom } from "@/utils/appTheme"
import { loadAgents } from "@/app/dashboard/_lib/data"
import { MACROS, initials, number } from "@/app/dashboard/_lib/stats"
import { dayIn } from "@/app/admin/_lib/format"
import { AgentsPanel } from "@/app/dashboard/_components/AgentsPanel"
import { Card } from "@/app/dashboard/_components/StatsPanel"
import { ThemeSwitch } from "@/app/dashboard/_components/TopBar"
import { logout } from "@/app/login/actions"

// Everything that isn't the food log: the account, goals (set in the app or by an agent), appearance, and the agents
// connected to the account.
export const dynamic = "force-dynamic"

const GOAL_COLUMNS = { kcal: "calorieGoal", carbG: "carbsGoal", proteinG: "proteinGoal", totalFatG: "fatGoal" } as const
const GOAL_TEXT = { kcal: "text-app-kcal", carbG: "text-app-carb", proteinG: "text-app-protein", totalFatG: "text-app-fat" }

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login?next=/settings")

  const [profile, agents] = await Promise.all([
    supabase.from("User").select("fullName, email, tzIdentifier, calorieGoal, proteinGoal, carbsGoal, fatGoal").eq("id", session.user.id)
      .maybeSingle().then(({ data }) => data),
    loadAgents(session.access_token).catch(error => { console.error("settings_agents_failed", error); return null })
  ])
  const name = profile?.fullName ?? undefined
  const email = profile?.email ?? session.user.email ?? undefined
  // The agents' daily calls are counted in the user's time zone.
  let today = new Date().toISOString().slice(0, 10)
  try { today = dayIn(new Date(), profile?.tzIdentifier ?? "UTC") } catch {}

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
        <h1 className="app-rise px-1 text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>

        <Card title="Account" className="app-rise" style={{ "--delay": "40ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-app-primary to-app-accent text-lg font-semibold text-white">
              {initials(name, email)}
            </span>
            <div className="min-w-0 flex-1">
              {name && <p className="truncate font-semibold">{name}</p>}
              {email && <p className="truncate text-sm text-app-muted">{email}</p>}
            </div>
            <form action={logout}>
              <button type="submit" className="flex items-center gap-2 rounded-full border border-app-border px-4 py-2 text-sm font-medium transition hover:bg-app-text/[0.05]">
                <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-app-muted" aria-hidden /> Log out
              </button>
            </form>
          </div>
        </Card>

        <Card title="Daily goals" subtitle="Change them in the Amino app, or ask a connected agent to."
          className="app-rise" style={{ "--delay": "80ms" } as React.CSSProperties}>
          <dl className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {MACROS.map(({ key, label, unit }) => {
              const goal = profile?.[GOAL_COLUMNS[key]]
              return (
                <div key={key} className="rounded-xl bg-app-text/[0.04] px-2 py-2 text-center sm:rounded-2xl sm:px-3 sm:py-3 sm:text-left">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-app-muted sm:text-[11px]">{label}</dt>
                  <dd className={`mt-0.5 text-base font-semibold tabular-nums sm:mt-1 sm:text-xl ${GOAL_TEXT[key]}`}>
                    {goal ? number(goal) : "—"}
                    <span className="block text-[10px] font-normal text-app-muted sm:ml-1 sm:inline sm:text-xs">{unit}</span>
                  </dd>
                </div>
              )
            })}
          </dl>
        </Card>

        <Card title="Appearance" subtitle="For this browser." className="app-rise" style={{ "--delay": "120ms" } as React.CSSProperties}>
          <ThemeSwitch initial={themeFrom(cookies().get(THEME_COOKIE)?.value)} />
        </Card>

        <AgentsPanel agents={agents} today={today} />
      </main>
    </>
  )
}
