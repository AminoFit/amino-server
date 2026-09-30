import Link from "next/link"
import classNames from "classnames"
import { requireAdmin } from "../_lib/auth"
import { rpc } from "../_lib/db"
import { ms, num, param, pct, usd, UUID, type Params } from "../_lib/format"
import type { CatalogueStats, MealKind, MealStats, StatGroup } from "../_lib/types"
import { Lines, StackedBars, type Point, type Series } from "../_components/Charts"
import { KIND_SERIES } from "../_components/kinds"
import { Badge, Card, Empty, PageHeader, RouteBadge, Stat, Table, Td, TextLink, Th } from "../_components/ui"

const RANGES = [7, 30, 90]
const BUCKETS = ["<5s", "5-10s", "10-20s", "20-40s", "40-80s", "80s+"]
// Catalogue sources in a fixed colour order (the newest pipeline's sources first).
const SOURCE_SERIES: Series[] = ["AgentEstimate", "Label", "USDA", "Online", "User", "GPT4", "NUTRITIONIX", "FATSECRET"]
  .map((key, index) => ({ key, label: key, color: `var(--series-${index + 1})` }))

/** Every day in the window, so a quiet day shows as zero instead of disappearing from the axis. */
function days(from: Date, to: Date) {
  const out: string[] = []
  for (const d = new Date(from.toISOString().slice(0, 10)); d < to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10))
  return out
}

export default async function StatsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const range = RANGES.includes(Number(param(searchParams, "days"))) ? Number(param(searchParams, "days")) : 30
  const userParam = param(searchParams, "user")
  const user = userParam && UUID.test(userParam) ? userParam : undefined
  const to = new Date(), from = new Date(to.getTime() - range * 86400000)
  const [stats, catalogue] = await Promise.all([
    rpc<MealStats>("admin_meal_stats", { p_from: from.toISOString(), p_to: to.toISOString(), p_user_id: user ?? null }),
    rpc<CatalogueStats>("admin_catalogue_stats", { p_from: from.toISOString(), p_to: to.toISOString() })
  ])
  const s = stats.summary
  const axis = days(from, to)
  const kindsSeen = KIND_SERIES.filter(k => stats.daily.some(d => d.kind === k.key))
  const perDay: Point[] = axis.map(day => ({ x: day, values: Object.fromEntries(kindsSeen.map(k =>
    [k.key, stats.daily.find(d => d.day === day && d.kind === k.key)?.n ?? 0])) }))
  const latencyPerDay: Point[] = axis.map(day => ({ x: day, values: Object.fromEntries(kindsSeen.map(k => {
    const p50 = stats.daily.find(d => d.day === day && d.kind === k.key)?.p50
    return [k.key, p50 == null ? null : Math.round(p50 / 100) / 10]
  })) }))
  const sourcesSeen = SOURCE_SERIES.filter(src => catalogue.createdDaily.some(d => d.source === src.key))
  const otherSources = catalogue.createdDaily.some(d => !SOURCE_SERIES.some(src => src.key === d.source))
  const createdSeries = [...sourcesSeen, ...(otherSources ? [{ key: "other", label: "Other", color: "var(--chart-axis)" }] : [])]
  const createdPerDay: Point[] = axis.map(day => ({ x: day, values: Object.fromEntries(createdSeries.map(src => [src.key,
    catalogue.createdDaily.filter(d => d.day === day && (src.key === "other" ? !SOURCE_SERIES.some(k => k.key === d.source) : d.source === src.key))
      .reduce((sum, d) => sum + d.n, 0)])) }))
  const activePerDay: Point[] = axis.map(day => ({ x: day, values: { users: catalogue.activeDaily.find(d => d.day === day)?.users ?? 0 } }))
  const link = (days: number) => `/admin/stats?days=${days}${user ? `&user=${user}` : ""}`

  return (
    <>
      <PageHeader title="Stats" subtitle={<>Food logging performance over the last {range} days{user && <> for <Link className="underline" href={`/admin/users/${user}`}>one user</Link> (<Link className="underline" href={`/admin/stats?days=${range}`}>everyone</Link>)</>}. Meals are create and replace operations; times run from the request to the published meal.</>}
        actions={<div className="flex rounded-md border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
          {RANGES.map(days => <Link key={days} href={link(days)} className={classNames("rounded px-2.5 py-1",
            days === range ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")}>{days} days</Link>)}
        </div>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Meals" value={num(s.n)} hint={`${num(s.users)} users`} />
        <Stat label="Succeeded" value={pct(s.succeeded, s.n)} hint={`${num(s.failed)} failed · ${num(s.pending)} pending`} tone={s.failed / Math.max(1, s.n) > 0.05 ? "bad" : undefined} />
        <Stat label="Median time" value={ms(s.p50)} hint={`p90 ${ms(s.p90)} · p95 ${ms(s.p95)}`} />
        <Stat label="Changed by the user" value={pct(s.edited, s.creates)} hint="edited, replaced or deleted later" href="/admin/meals?state=edited" />
        <Stat label="Needed a retry" value={pct(s.retried, s.n)} hint={`${num(s.clarified)} clarifications`} href="/admin/meals?state=retried" />
        <Stat label="Model cost" value={usd(s.cost)} hint={s.costed ? `${usd(s.avgCost)} per meal · ${num(s.avgTokens)} tokens` : "recorded from 1 Oct 2026"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Meals per day, by what the user sent">
          {s.n ? <StackedBars data={perDay} series={kindsSeen} /> : <Empty>No meals in this window.</Empty>}
        </Card>
        <Card title="Median seconds to resolve, per day">
          {s.n ? <Lines data={latencyPerDay} series={kindsSeen} unit=" s" /> : <Empty>No meals in this window.</Empty>}
        </Card>
      </div>

      <Card className="mt-5" title="By what the user sent" padded={false}>
        <GroupTable groups={stats.groups.filter(g => g.dim === "kind")} latency={stats.latency} label="Input" />
      </Card>
      <Card className="mt-5" title="By route" padded={false}>
        <GroupTable groups={stats.groups.filter(g => g.dim === "route")} label="Route" />
      </Card>

      <Card className="mt-5" title="Errors, failures and clarifications" padded={false}>
        {stats.errors.length ? (
          <Table>
            <thead><tr><Th>Code</Th><Th right>Meals</Th><Th>Last</Th><Th /></tr></thead>
            <tbody>
              {stats.errors.map(error => (
                <tr key={error.code}>
                  <Td mono>{error.code}</Td><Td right>{num(error.n)}</Td>
                  <Td className="text-xs text-zinc-500">{new Date(error.last).toLocaleString("en-GB")}</Td>
                  <Td><TextLink href={`/admin/meals?state=${["retry_wait", "needs_clarification"].includes(error.code) ? error.code : "failed"}`}>meals →</TextLink></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <Empty>No errors.</Empty>}
      </Card>

      <h2 className="mb-3 mt-8 text-base font-semibold">Catalogue and usage</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Foods" value={num(catalogue.totals.foods)} href="/admin/foods" />
        <Stat label="Private foods" value={num(catalogue.totals.private)} href="/admin/foods?filter=private" />
        <Stat label="Verified" value={pct(catalogue.totals.verified, catalogue.totals.foods)} />
        <Stat label="With a barcode" value={num(catalogue.totals.withGtin)} href="/admin/foods?filter=gtin" />
        <Stat label="Without an icon" value={num(catalogue.totals.withoutIcon)} href="/admin/foods?filter=no_icon" tone={catalogue.totals.withoutIcon ? "warn" : undefined} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Foods added per day, by source">
          {createdSeries.length ? <StackedBars data={createdPerDay} series={createdSeries} /> : <Empty>No foods added in this window.</Empty>}
        </Card>
        <Card title="Users who logged, per day">
          <Lines data={activePerDay} series={[{ key: "users", label: "Users", color: "var(--series-1)" }]} />
        </Card>
        <Card title={`Most logged foods, last ${range} days`} padded={false}>
          <Table>
            <thead><tr><Th>Food</Th><Th right>Logs</Th><Th right>Users</Th></tr></thead>
            <tbody>
              {catalogue.topFoods.map(food => (
                <tr key={food.id}>
                  <Td><Link href={`/admin/foods/${food.id}`} className="hover:underline">{food.name}</Link> <span className="text-xs text-zinc-500">{food.brand}</span></Td>
                  <Td right>{num(food.logs)}</Td><Td right>{num(food.users)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Catalogue by source" padded={false}>
          <Table>
            <thead><tr><Th>Source</Th><Th right>Foods</Th><Th right>Added in window</Th></tr></thead>
            <tbody>
              {catalogue.bySource.map(row => (
                <tr key={row.source}>
                  <Td><Link href={`/admin/foods?source=${row.source}&sort=newest`} className="hover:underline">{row.source}</Link></Td>
                  <Td right>{num(row.n)}</Td><Td right>{num(row.created)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {catalogue.bugs.length > 0 && (
            <div className="border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
              Bug reports in window: {catalogue.bugs.map(b => <span key={b.type ?? "none"} className="mr-2"><Badge tone="red">{b.type ?? "other"}</Badge> {b.n}</span>)}
              <TextLink href="/admin/reports">reports →</TextLink>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function GroupTable({ groups, latency, label }: { groups: StatGroup[]; latency?: MealStats["latency"]; label: string }) {
  if (!groups.length) return <Empty>No meals.</Empty>
  return (
    <Table>
      <thead>
        <tr>
          <Th>{label}</Th><Th right>Meals</Th><Th right>Succeeded</Th><Th right>Failed</Th><Th right>Clarified</Th><Th right>Retried</Th>
          <Th right>Changed later</Th><Th right>Median</Th><Th right>p90</Th><Th right>Foods / meal</Th><Th right>Cost / meal</Th>
          {latency && <Th>Time to resolve</Th>}
        </tr>
      </thead>
      <tbody>
        {groups.map(g => {
          const series = KIND_SERIES.find(k => k.key === g.key)
          const buckets = latency?.filter(l => l.kind === (g.key as MealKind)) ?? []
          const total = buckets.reduce((sum, b) => sum + b.n, 0)
          return (
            <tr key={g.key}>
              <Td>{label === "Route" ? <RouteBadge route={g.key === "none" ? "no plan" : g.key} /> :
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: series?.color }} />{series?.label ?? g.key}</span>}</Td>
              <Td right>{num(g.n)}</Td>
              <Td right>{pct(g.succeeded, g.n)}</Td>
              <Td right className={g.failed ? "text-red-700 dark:text-red-400" : undefined}>{num(g.failed)}</Td>
              <Td right>{num(g.clarified)}</Td>
              <Td right>{num(g.retried)}</Td>
              <Td right>{pct(g.edited, g.creates)}</Td>
              <Td right>{ms(g.p50)}</Td>
              <Td right>{ms(g.p90)}</Td>
              <Td right>{num(g.items, 1)}</Td>
              <Td right>{usd(g.avgCost)}</Td>
              {latency && (
                <Td className="min-w-[12rem]">
                  <div className="flex h-3 overflow-hidden rounded" title={BUCKETS.map(b => `${b}: ${buckets.find(x => x.bucket === b)?.n ?? 0}`).join("\n")}>
                    {BUCKETS.map((bucket, i) => {
                      const n = buckets.find(b => b.bucket === bucket)?.n ?? 0
                      return n ? <span key={bucket} style={{ width: `${(100 * n) / total}%`, background: `var(--seq-${i + 1})` }} className="border-r-2 border-white last:border-r-0 dark:border-zinc-900" /> : null
                    })}
                  </div>
                </Td>
              )}
            </tr>
          )
        })}
      </tbody>
      {latency && (
        <tfoot>
          <tr><td colSpan={12} className="px-3 py-2 text-[11px] text-zinc-500">
            Time to resolve: {BUCKETS.map((bucket, i) => <span key={bucket} className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: `var(--seq-${i + 1})` }} />{bucket}</span>)}
          </td></tr>
        </tfoot>
      )}
    </Table>
  )
}
