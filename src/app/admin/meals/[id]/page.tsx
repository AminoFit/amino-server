import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "../../_lib/auth"
import { adminDb, must } from "../../_lib/db"
import { foodIcons } from "../../_lib/foods"
import { mealPhotos } from "../../_lib/meals"
import { inZone, ms, num, utc } from "../../_lib/format"
import type { MealOperationRow, MealRunRow } from "../../_lib/types"
import {
  Badge, Card, Empty, FoodIcon, Json, KeyValues, Macros, PageHeader, RouteBadge, StateBadge, Table, Td, TextLink, Th, When
} from "../../_components/ui"
import { RunView } from "./RunView"

type LoggedRow = { id: number; foodItemId: number | null; servingId: number | null; servingAmount: number | null; loggedUnit: string | null
  grams: number; kcal: number | null; proteinG: number | null; carbG: number | null; totalFatG: number | null; status: string | null
  consumedOn: string; createdAt: string; updatedAt: string; deletedAt: string | null; publishedRevision: number; logicalItemId: string | null
  extendedOpenAiData: { evidence?: string[]; groupId?: string; mealOperationId?: string } | null
  FoodItem: { id: number; name: string; brand: string | null; foodInfoSource: string; privateToUserId: string | null } | null
  Serving: { servingName: string } | null }

export default async function MealPage({ params }: { params: { id: string } }) {
  await requireAdmin()
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const db = adminDb()
  const [messageResult, operations, revisions, runs, logged, bugs, photos] = await Promise.all([
    db.from("Message").select("*").eq("id", id).maybeSingle(),
    db.from("MealOperation").select("id,userId,messageId,action,state,attempts,generation,input,plan,result,answers,errorCode,createdAt,updatedAt,completedAt,nextAttemptAt,leaseUntil,expectedPublishedRevision")
      .eq("messageId", id).order("generation"),
    db.from("MealRevision").select("revision,operationId,publishedAt,snapshot").eq("messageId", id).order("revision"),
    db.from("MealRun").select("*").eq("messageId", id).order("id"),
    db.from("LoggedFoodItem").select("id,foodItemId,servingId,servingAmount,loggedUnit,grams,kcal,proteinG,carbG,totalFatG,status,consumedOn,createdAt,updatedAt,deletedAt,publishedRevision,logicalItemId,extendedOpenAiData,FoodItem(id,name,brand,foodInfoSource,privateToUserId),Serving(servingName)")
      .eq("messageId", id).order("deletedAt", { nullsFirst: true }).order("id"),
    db.from("userSubmittedBug").select("*").eq("message_id", id).order("id"),
    mealPhotos([id])
  ])
  const message = must("Message", messageResult) as Record<string, any> | null
  if (!message) notFound()
  const ops = must("MealOperation", operations) as MealOperationRow[]
  const runRows = (runs.error ? [] : runs.data ?? []) as MealRunRow[]
  const items = must("LoggedFoodItem", logged) as unknown as LoggedRow[]
  const revisionRows = must("MealRevision", revisions) as { revision: number; operationId: string; publishedAt: string; snapshot: unknown }[]
  const bugRows = must("userSubmittedBug", bugs) as Record<string, any>[]
  const [user, icons] = await Promise.all([
    db.from("User").select("id,email,fullName,tzIdentifier").eq("id", message.userId).maybeSingle().then(r => must("User", r)) as Promise<{ id: string; email: string | null; fullName: string | null; tzIdentifier: string } | null>,
    foodIcons(items.flatMap(item => item.foodItemId ? [item.foodItemId] : []))
  ])
  const zone = user?.tzIdentifier ?? "UTC"
  const live = items.filter(item => !item.deletedAt)
  const total = (key: "kcal" | "proteinG" | "carbG" | "totalFatG") => live.reduce((sum, item) => sum + (item[key] ?? 0), 0)
  const latest = [...ops].reverse().find(op => op.action === "create" || op.action === "replace")
  const images = photos.get(id) ?? []

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin/meals", label: "Meals" }]}
        title={<span className="flex items-center gap-2">Meal #{id} <StateBadge state={latest?.state ?? (ops.length ? null : message.status)} /> <RouteBadge route={latest?.plan?.model?.id} /></span>}
        subtitle={<>
          <Link href={`/admin/users/${message.userId}`} className="hover:underline">{user?.email ?? message.userId}</Link>
          {" · "}sent {inZone(message.createdAt, zone)} their time ({zone})
        </>}
        actions={<TextLink href={`/admin/meals?user=${message.userId}`}>This user’s meals →</TextLink>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="What the user sent">
            {message.content?.trim() ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : <p className="text-sm italic text-zinc-400">No text</p>}
            {message.isAudio && <div className="mt-2"><Badge tone="amber">voice (transcript above; audio is not stored)</Badge></div>}
            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {images.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="w-full rounded object-cover" /></a>)}
              </div>
            )}
          </Card>
          <Card title="Message">
            <KeyValues rows={[
              ["Sent", <When key="s" value={message.createdAt} zone={zone} />],
              ["Eaten", message.consumedOn ? `${inZone(message.consumedOn, zone)} (user time)` : "—"],
              ["Resolved", message.resolvedAt ? <When value={message.resolvedAt} zone={zone} /> : "—"],
              ["Send → resolved", message.resolvedAt ? ms(utc(message.resolvedAt)!.getTime() - utc(message.createdAt)!.getTime()) : "—"],
              ["Status", <code key="st" className="text-xs">{message.status}</code>],
              ["Revision", message.publishedRevision],
              ["Type", <code key="t" className="text-xs">{message.messageType}</code>],
              ["Deleted", message.deletedAt ? <When value={message.deletedAt} /> : "no"],
              ["Local ID", <code key="l" className="break-all text-xs">{message.local_id ?? "—"}</code>]
            ]} />
            <div className="mt-3"><Json label="Message row" value={message} /></div>
          </Card>
          {bugRows.length > 0 && (
            <Card title={`Bug reports (${bugRows.length})`}>
              <ul className="space-y-2 text-sm">
                {bugRows.map(bug => <li key={bug.id}><Badge tone="red">{bug.bug_type ?? "report"}</Badge> {bug.extra_details ?? ""} <span className="text-xs text-zinc-400"><When value={bug.created_at} /></span></li>)}
              </ul>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="Logged foods" padded={false} actions={<Macros kcal={total("kcal")} protein={total("proteinG")} carbs={total("carbG")} fat={total("totalFatG")} />}>
            {items.length ? (
              <Table>
                <thead><tr><Th>Food</Th><Th>Amount</Th><Th right>kcal</Th><Th right>P / C / F</Th><Th>Why (evidence)</Th></tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className={item.deletedAt ? "opacity-50" : undefined}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <FoodIcon src={item.foodItemId ? icons.get(item.foodItemId) : null} />
                          <div className="min-w-0">
                            {item.FoodItem ? <Link href={`/admin/foods/${item.FoodItem.id}`} className="font-medium hover:underline">{item.FoodItem.name}</Link> : <span className="text-zinc-400">no food</span>}
                            <div className="flex flex-wrap gap-1 text-xs text-zinc-500">
                              {item.FoodItem?.brand && <span>{item.FoodItem.brand}</span>}
                              {item.FoodItem && <Badge>{item.FoodItem.foodInfoSource}</Badge>}
                              {item.FoodItem?.privateToUserId && <Badge tone="violet">private</Badge>}
                              {item.deletedAt && <Badge tone="red">deleted</Badge>}
                              <span className="font-mono">#{item.id}</span>
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{num(item.servingAmount, 2)} {item.Serving?.servingName ?? item.loggedUnit ?? "g"}<div className="text-zinc-400">{num(item.grams, 1)} g</div></Td>
                      <Td right>{num(item.kcal)}</Td>
                      <Td right className="whitespace-nowrap text-xs">{num(item.proteinG, 1)} / {num(item.carbG, 1)} / {num(item.totalFatG, 1)}</Td>
                      <Td className="max-w-[20rem] text-xs text-zinc-600 dark:text-zinc-300">
                        {item.extendedOpenAiData?.evidence?.length ? item.extendedOpenAiData.evidence.map((line, i) => <div key={i} className="break-words">{line}</div>) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <Empty>Nothing logged.</Empty>}
          </Card>

          <Card title={`Operations (${ops.length})`} padded={false}>
            {ops.length ? (
              <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {ops.map(op => {
                  const opRuns = runRows.filter(run => run.operationId === op.id)
                  return (
                    <li key={op.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-zinc-400">gen {op.generation}</span>
                        <b className="font-semibold">{op.action}</b>
                        <StateBadge state={op.state} />
                        <RouteBadge route={op.plan?.model?.id} />
                        {op.errorCode && <code className="text-xs text-red-700 dark:text-red-400">{op.errorCode}</code>}
                        {op.attempts > 1 && <Badge tone="amber">{op.attempts} attempts</Badge>}
                        <span className="ml-auto text-xs text-zinc-500">
                          <When value={op.createdAt} zone={zone} />
                          {op.completedAt && <> · took {ms(new Date(op.completedAt).getTime() - new Date(op.createdAt).getTime())}</>}
                        </span>
                      </div>
                      {opRuns.map(run => <RunView key={run.id} run={run} />)}
                      {!opRuns.length && <p className="text-xs text-zinc-400">No run record (runs are kept for 60 days, and only from 2026-10-01).</p>}
                      <div className="grid gap-2 md:grid-cols-3">
                        <Json label="Input" value={op.input} />
                        <Json label={`Plan${op.plan?.items ? ` (${op.plan.items.length} items)` : ""}`} value={op.plan} />
                        <Json label="Result, answers" value={{ result: op.result, answers: op.answers, nextAttemptAt: op.nextAttemptAt, leaseUntil: op.leaseUntil }} />
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : <Empty>No meal operations: this meal predates the operation pipeline.</Empty>}
          </Card>

          {revisionRows.length > 0 && (
            <Card title={`Published revisions (${revisionRows.length})`}>
              <div className="space-y-2">
                {revisionRows.map(revision => (
                  <Json key={revision.revision} value={revision.snapshot}
                    label={<>Revision {revision.revision} · <When value={revision.publishedAt} /> · op {revision.operationId.slice(0, 8)}</>} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

