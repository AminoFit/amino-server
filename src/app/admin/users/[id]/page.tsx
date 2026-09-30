import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "../../_lib/auth"
import { adminDb, must, rpc } from "../../_lib/db"
import { listMeals } from "../../_lib/meals"
import { dayIn, ms, num, param, pct, shiftDay, usd, UUID, zoneDayBounds, type Params } from "../../_lib/format"
import type { MealStats } from "../../_lib/types"
import { Card, Empty, KeyValues, Macros, PageHeader, Stat, TextLink, When } from "../../_components/ui"
import { MealTable } from "../../meals/MealTable"

type User = { id: string; email: string | null; fullName: string | null; tzIdentifier: string; subscriptionType: string | null
  subscriptionExpiryDate: string | null; calorieGoal: number | null; proteinGoal: number | null; carbsGoal: number | null
  fatGoal: number | null; setupCompleted: boolean; unitPreference: string | null; weightKg: number | null; heightCm: number | null }

export default async function UserPage({ params, searchParams }: { params: { id: string }; searchParams: Params }) {
  await requireAdmin()
  if (!UUID.test(params.id)) notFound()
  const user = must("User", await adminDb().from("User")
    .select("id,email,fullName,tzIdentifier,subscriptionType,subscriptionExpiryDate,calorieGoal,proteinGoal,carbsGoal,fatGoal,setupCompleted,unitPreference,weightKg,heightCm")
    .eq("id", params.id).maybeSingle()) as User | null
  if (!user) notFound()
  const zone = user.tzIdentifier || "UTC"
  const today = dayIn(new Date(), zone)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(param(searchParams, "day") ?? "") ? param(searchParams, "day")! : today
  const bounds = zoneDayBounds(day, zone)
  const [stats, dayMeals, recent] = await Promise.all([
    rpc<MealStats>("admin_meal_stats", { p_from: new Date(Date.now() - 30 * 86400000).toISOString(), p_to: new Date().toISOString(), p_user_id: user.id }),
    listMeals({ userId: user.id, dateField: "consumed", from: bounds.from.toISOString(), to: bounds.to.toISOString() }, 1, 100),
    listMeals({ userId: user.id }, 1, 15, false)
  ])
  const s = stats.summary
  const eaten = dayMeals.meals.reduce((sum, meal) => sum + (meal.kcal ?? 0), 0)
  return (
    <>
      <PageHeader crumbs={[{ href: "/admin/users", label: "Users" }]} title={user.email ?? user.id}
        subtitle={<>{user.fullName ? `${user.fullName} · ` : ""}{zone} · <span className="font-mono text-xs">{user.id}</span></>}
        actions={<><TextLink href={`/admin/meals?user=${user.id}`}>All meals →</TextLink><TextLink href={`/admin/stats?user=${user.id}`}>Stats →</TextLink></>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Meals, 30 d" value={num(s.n)} />
        <Stat label="Succeeded" value={pct(s.succeeded, s.n)} hint={`${num(s.failed)} failed`} tone={s.failed ? "warn" : undefined}
          href={s.failed ? `/admin/meals?user=${user.id}&state=failed` : undefined} />
        <Stat label="Median time" value={ms(s.p50)} hint={`p90 ${ms(s.p90)}`} />
        <Stat label="Changed afterwards" value={pct(s.edited, s.creates)} hint={`${num(s.edited)} meals`} href={`/admin/meals?user=${user.id}&state=edited`} />
        <Stat label="Cost, 30 d" value={usd(s.cost)} hint={s.costed ? `${usd(s.avgCost)} per meal` : "no run records yet"} />
        <Stat label="Foods per meal" value={num(s.items, 1)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card padded={false} title={
          <span className="flex items-center gap-3">
            <Link href={`?day=${shiftDay(day, -1)}`} className="rounded px-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Previous day">←</Link>
            <span>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <Link href={`?day=${shiftDay(day, 1)}`} className="rounded px-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Next day">→</Link>
            {day !== today && <Link href="?" className="text-xs font-normal text-sky-700 hover:underline dark:text-sky-400">today</Link>}
          </span>
        } actions={<span><b className="tabular-nums">{num(eaten)}</b>{user.calorieGoal ? ` / ${num(user.calorieGoal)}` : ""} kcal eaten (user time)</span>}>
          {dayMeals.meals.length ? <MealTable rows={dayMeals.meals} photos={dayMeals.photos} showUser={false} /> : <Empty>Nothing logged this day.</Empty>}
        </Card>
        <div className="space-y-5">
          <Card title="Profile">
            <KeyValues rows={[
              ["Goals", <Macros key="g" kcal={user.calorieGoal} protein={user.proteinGoal} carbs={user.carbsGoal} fat={user.fatGoal} />],
              ["Plan", user.subscriptionType ?? "—"],
              ["Plan ends", user.subscriptionExpiryDate ? <When value={user.subscriptionExpiryDate} /> : "—"],
              ["Setup done", user.setupCompleted ? "yes" : "no"],
              ["Units", user.unitPreference ?? "—"],
              ["Body", [user.weightKg && `${num(user.weightKg, 1)} kg`, user.heightCm && `${num(user.heightCm)} cm`].filter(Boolean).join(" · ") || "—"]
            ]} />
          </Card>
          <Card title="How their meals were sent, 30 d">
            <ul className="space-y-1 text-sm">
              {stats.groups.filter(g => g.dim === "kind").map(g => (
                <li key={g.key} className="flex justify-between gap-2"><span>{g.key}</span><span className="tabular-nums text-zinc-500">{g.n} · median {ms(g.p50)}</span></li>
              ))}
              {!stats.groups.length && <li className="text-zinc-400">No meals in 30 days.</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-5" title="Latest meals sent" padded={false} actions={<TextLink href={`/admin/meals?user=${user.id}`}>All →</TextLink>}>
        {recent.meals.length ? <MealTable rows={recent.meals} compact showUser={false} /> : <Empty>No meals.</Empty>}
      </Card>
    </>
  )
}
