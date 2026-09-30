import { requireAdmin } from "./_lib/auth"
import { rpc } from "./_lib/db"
import { ms, num, pct } from "./_lib/format"
import type { MealListRow, Overview } from "./_lib/types"
import { Badge, Card, Empty, PageHeader, Stat, StatGrid, TextLink, When } from "./_components/ui"
import { MealTable } from "./meals/MealTable"

export default async function AdminOverviewPage() {
  await requireAdmin()
  const [overview, failures, recent] = await Promise.all([
    rpc<Overview>("admin_overview"),
    rpc<MealListRow[]>("admin_meals", { p_state: "failed", p_from: new Date(Date.now() - 7 * 86400000).toISOString(), p_limit: 8 }),
    rpc<MealListRow[]>("admin_meals", { p_limit: 12 })
  ])
  const day = overview.last24h
  const stuck = overview.stuck.running + overview.stuck.queued + overview.processingMessages
  return (
    <>
      <PageHeader title="Overview" subtitle="The last 24 hours, and anything that needs attention now." />
      <StatGrid>
        <Stat label="Meals, 24 h" value={num(day.n)} hint={`${num(day.users)} users`} href="/admin/meals" />
        <Stat label="Succeeded" value={pct(day.succeeded, day.n)} hint={`${num(day.succeeded)} of ${num(day.n)}`} />
        <Stat label="Failed, 24 h" value={num(day.failed)} tone={day.failed ? "bad" : undefined} href="/admin/meals?state=failed" />
        <Stat label="Median time" value={ms(day.p50)} hint="create → published" href="/admin/stats" />
        <Stat label="Stuck now" value={num(stuck)} tone={stuck ? "warn" : undefined}
          hint={`${overview.stuck.running} expired leases · ${overview.stuck.queued} queued · ${overview.processingMessages} processing`} />
        <Stat label="Retrying" value={num(overview.stuck.retrying)} hint={`outbox ${overview.outbox.pending} pending`}
          tone={overview.outbox.pending > 5 ? "warn" : undefined} href="/admin/meals?state=retry_wait" />
      </StatGrid>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active users, 7 d" value={num(overview.users7d)} href="/admin/users" />
        <Stat label="Foods added, 24 h" value={num(overview.foods24h)} href="/admin/foods?sort=newest" />
        <Stat label="Bug reports, 7 d" value={num(overview.bugs7d)} href="/admin/reports" tone={overview.bugs7d ? "warn" : undefined} />
        <Stat label="Clarifications, 24 h" value={num(day.clarified)} href="/admin/meals?state=needs_clarification" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card title="Failed meals, last 7 days" actions={<TextLink href="/admin/meals?state=failed">All failures →</TextLink>} padded={false}>
            {failures.length ? <MealTable rows={failures} compact /> : <Empty>No failed meals in the last 7 days.</Empty>}
          </Card>
          <Card title="Latest meals" actions={<TextLink href="/admin/meals">All meals →</TextLink>} padded={false}>
            <MealTable rows={recent} compact />
          </Card>
        </div>
        <Card title="Feature flags">
          <ul className="space-y-2 text-sm">
            {overview.flags.map(flag => (
              <li key={flag.name} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs">{flag.name}</code>
                  <Badge tone={flag.value === "off" ? "gray" : flag.value === "all" ? "green" : "blue"}>
                    {flag.value === "off" || flag.value === "all" ? flag.value : `${flag.value.split(",").length} users`}
                  </Badge>
                </div>
                <span className="text-xs text-zinc-400">changed <When value={flag.updatedAt} /></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Read-only here. Change a flag in the FeatureFlag table.</p>
        </Card>
      </div>
    </>
  )
}
