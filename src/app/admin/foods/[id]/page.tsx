import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "../../_lib/auth"
import { adminDb, must, rpc } from "../../_lib/db"
import { ago, num } from "../../_lib/format"
import {
  Badge, Card, Empty, FoodIcon, Json, KeyValues, PageHeader, Stat, Table, Td, TextLink, Th, When
} from "../../_components/ui"

const FOOD_COLUMNS = "id,name,brand,description,knownAs,foodInfoSource,externalId,UPC,gtin,verified,weightUnknown,isLiquid,messageId,userId,privateToUserId,createdAtDateTime,lastUpdated,foodItemCategoryID,foodItemCategoryName,defaultServingWeightGram,defaultServingLiquidMl,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,satFatPerServing,transFatPerServing,fiberPerServing,sugarPerServing,addedSugarPerServing"

type Food = Record<string, any> & { id: number; name: string; brand: string | null; kcalPerServing: number; proteinPerServing: number
  carbPerServing: number; totalFatPerServing: number; fiberPerServing: number | null; defaultServingWeightGram: number | null
  privateToUserId: string | null; messageId: number | null }
type Usage = { logs: number; users: number; first: string | null; last: string | null; deleted: number; avgGrams: number | null; last30d: number }
type Similar = { id: number; name: string; brand: string | null; foodInfoSource: string; kcalPerServing: number
  defaultServingWeightGram: number | null; privateToUserId: string | null; similarity: number }

export default async function FoodPage({ params }: { params: { id: string } }) {
  await requireAdmin()
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const db = adminDb()
  const [foodResult, servings, images, usage, similar, logs, audits, merged, conflicts, bugs, nutrients] = await Promise.all([
    db.from("FoodItem").select(FOOD_COLUMNS).eq("id", id).maybeSingle(),
    db.from("Serving").select("*").eq("foodItemId", id).order("id"),
    db.from("FoodItemImages").select("id,similarity,createdAt,FoodImage(id,pathToImage,originalPath,imageDescription,downvotes)").eq("foodItemId", id),
    rpc<Usage>("admin_food_usage", { p_food_id: id }),
    rpc<Similar[]>("admin_similar_foods", { p_food_id: id, p_limit: 10 }),
    db.from("LoggedFoodItem").select("id,userId,messageId,grams,servingAmount,loggedUnit,kcal,consumedOn,deletedAt,Serving(servingName),User(email)")
      .eq("foodItemId", id).order("consumedOn", { ascending: false }).limit(25),
    db.from("CatalogueAuditBackup").select("id,audit,tableName,rowId,before,createdAt").eq("tableName", "FoodItem").eq("rowId", id).order("id"),
    db.from("CatalogueAuditBackup").select("id,audit,rowId,before,createdAt").filter("before->>mergedInto", "eq", String(id)).order("id"),
    db.from("FoodItemConflict").select("*").eq("foodItemId", id).order("id", { ascending: false }).limit(20),
    db.from("userSubmittedBug").select("*").eq("food_item_id", id).order("id", { ascending: false }).limit(20),
    db.from("Nutrient").select("nutrientName,nutrientUnit,nutrientAmountPerDefaultServing").eq("foodItemId", id).order("nutrientName")
  ])
  const food = must("FoodItem", foodResult) as Food | null
  if (!food) notFound()
  const servingRows = must("Serving", servings) as Record<string, any>[]
  const imageRows = (must("FoodItemImages", images) as unknown as { id: number; similarity: number; createdAt: string
    FoodImage: { id: number; pathToImage: string; originalPath: string | null; imageDescription: string | null; downvotes: number } | null }[])
    .filter(row => row.FoodImage).sort((a, b) => a.FoodImage!.downvotes - b.FoodImage!.downvotes || b.FoodImage!.id - a.FoodImage!.id)
  const logRows = must("LoggedFoodItem", logs) as unknown as { id: number; userId: string; messageId: number | null; grams: number
    servingAmount: number | null; loggedUnit: string | null; kcal: number | null; consumedOn: string; deletedAt: string | null
    Serving: { servingName: string } | null; User: { email: string | null } | null }[]
  const auditRows = must("CatalogueAuditBackup", audits) as { id: number; audit: string; before: unknown; createdAt: string }[]
  const mergedRows = must("CatalogueAuditBackup merged", merged) as { id: number; audit: string; rowId: number; before: Record<string, any>; createdAt: string }[]
  const conflictRows = must("FoodItemConflict", conflicts) as { id: number; source: string; existing: unknown; proposed: unknown; createdAt: string }[]
  const bugRows = must("userSubmittedBug", bugs) as Record<string, any>[]
  const nutrientRows = (nutrients.error ? [] : nutrients.data ?? []) as { nutrientName: string; nutrientUnit: string; nutrientAmountPerDefaultServing: number }[]
  const owner = food.privateToUserId ? must("User", await db.from("User").select("email").eq("id", food.privateToUserId).maybeSingle()) as { email: string | null } | null : null

  // The 4/4/9 energy check: a hint only (fibre, sugar alcohols and label rounding all move it).
  const macroKcal = 4 * food.proteinPerServing + 4 * food.carbPerServing + 9 * food.totalFatPerServing
  const gap = food.kcalPerServing ? (macroKcal - food.kcalPerServing) / food.kcalPerServing : null
  const per100 = (value: number | null | undefined) => food.defaultServingWeightGram && value != null ? num((100 * value) / food.defaultServingWeightGram, 1) : "—"

  return (
    <>
      <PageHeader crumbs={[{ href: "/admin/foods", label: "Foods" }]}
        title={<span className="flex items-center gap-3"><FoodIcon src={imageRows[0]?.FoodImage?.pathToImage} size={40} />{food.name}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-1.5">
          {food.brand && <span>{food.brand}</span>}
          <span className="font-mono">#{food.id}</span>
          <Badge>{food.foodInfoSource}</Badge>
          {food.verified && <Badge tone="green">verified</Badge>}
          {food.privateToUserId && <Badge tone="violet">private to {owner?.email ?? food.privateToUserId.slice(0, 8)}</Badge>}
          {food.gtin && <Badge tone="blue">GTIN {food.gtin}</Badge>}
        </span>}
        actions={<TextLink href={`/admin/foods?q=${encodeURIComponent(food.name)}`}>Same name →</TextLink>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Logs" value={num(usage.logs)} hint={`${num(usage.last30d)} in 30 days`} />
        <Stat label="Users" value={num(usage.users)} />
        <Stat label="Last logged" value={ago(usage.last)} hint={usage.first ? `first ${ago(usage.first)}` : undefined} />
        <Stat label="Average portion" value={usage.avgGrams ? `${num(usage.avgGrams)} g` : "—"} />
        <Stat label="Deleted logs" value={num(usage.deleted)} tone={usage.deleted > usage.logs / 4 && usage.deleted > 2 ? "warn" : undefined} />
        <Stat label="Reports" value={num(bugRows.length)} tone={bugRows.length ? "warn" : undefined} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Nutrition">
          <Table>
            <thead><tr><Th /><Th right>Per serving ({food.defaultServingWeightGram ? `${num(food.defaultServingWeightGram)} g` : "weight unknown"})</Th><Th right>Per 100 g</Th></tr></thead>
            <tbody>
              {([["Energy (kcal)", "kcalPerServing"], ["Protein (g)", "proteinPerServing"], ["Carbohydrate (g)", "carbPerServing"],
                ["Fat (g)", "totalFatPerServing"], ["Saturated fat (g)", "satFatPerServing"], ["Trans fat (g)", "transFatPerServing"],
                ["Fibre (g)", "fiberPerServing"], ["Sugar (g)", "sugarPerServing"], ["Added sugar (g)", "addedSugarPerServing"]] as const).map(([label, key]) => (
                <tr key={key}><Td>{label}</Td><Td right>{num(food[key], 1)}</Td><Td right>{per100(food[key])}</Td></tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-zinc-500">
            4/4/9 from macros: <b className="tabular-nums">{num(macroKcal)}</b> kcal
            {gap != null && <> ({gap >= 0 ? "+" : ""}{(100 * gap).toFixed(0)}% vs stated){Math.abs(gap) > 0.2 && <> <Badge tone="amber">check</Badge></>}</>}
            . A hint only: fibre, sugar alcohols and label rounding all move it.
          </p>
          {nutrientRows.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-300">Other nutrients ({nutrientRows.length})</summary>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                {nutrientRows.map(n => <li key={n.nutrientName} className="flex justify-between"><span>{n.nutrientName}</span><span className="tabular-nums">{num(n.nutrientAmountPerDefaultServing, 2)} {n.nutrientUnit}</span></li>)}
              </ul>
            </details>
          )}
        </Card>

        <Card title="Details">
          <KeyValues rows={[
            ["Description", food.description],
            ["Also known as", food.knownAs?.length ? food.knownAs.join(", ") : null],
            ["Category", food.foodItemCategoryName],
            ["External ID", food.externalId ? <code className="text-xs">{food.externalId}</code> : null],
            ["UPC / GTIN", [food.UPC, food.gtin].filter(Boolean).join(" / ") || null],
            ["Liquid", food.isLiquid ? `yes${food.defaultServingLiquidMl ? ` (${num(food.defaultServingLiquidMl)} mL)` : ""}` : "no"],
            ["Weight unknown", food.weightUnknown ? "yes" : "no"],
            ["Added", <When key="a" value={food.createdAtDateTime} />],
            ["Updated", <When key="u" value={food.lastUpdated} />],
            ["Created from meal", food.messageId ? <TextLink href={`/admin/meals/${food.messageId}`}>#{food.messageId}</TextLink> : null],
            ["Imported by", food.userId ? <TextLink href={`/admin/users/${food.userId}`}>{food.userId.slice(0, 8)}</TextLink> : null]
          ]} />
          <div className="mt-3"><Json label="Food row" value={food} /></div>
        </Card>

        <Card title={`Servings (${servingRows.length})`} padded={false}>
          {servingRows.length ? (
            <Table>
              <thead><tr><Th>Name</Th><Th right>Amount</Th><Th right>Grams</Th><Th right>kcal</Th><Th>Alternate</Th></tr></thead>
              <tbody>
                {servingRows.map(serving => (
                  <tr key={serving.id}>
                    <Td>{serving.servingName} <span className="font-mono text-xs text-zinc-400">#{serving.id}</span></Td>
                    <Td right>{num(serving.defaultServingAmount, 2)}</Td>
                    <Td right>{num(serving.servingWeightGram, 1)}</Td>
                    <Td right>{food.defaultServingWeightGram && serving.servingWeightGram ? num((food.kcalPerServing * serving.servingWeightGram) / food.defaultServingWeightGram) : "—"}</Td>
                    <Td className="text-xs">{serving.servingAlternateAmount ? `${num(serving.servingAlternateAmount, 2)} ${serving.servingAlternateUnit ?? ""}` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No servings: logged by weight only.</Empty>}
        </Card>

        <Card title={`Icons (${imageRows.length})`}>
          {imageRows.length ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {imageRows.map((row, index) => (
                <li key={row.id} className="text-xs">
                  <a href={row.FoodImage!.originalPath ?? row.FoodImage!.pathToImage} target="_blank" rel="noreferrer">
                    <img src={row.FoodImage!.pathToImage} alt="" className="aspect-square w-full rounded bg-zinc-100 object-contain dark:bg-zinc-800" />
                  </a>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {index === 0 && <Badge tone="green">shown</Badge>}
                    <span className="text-zinc-500">match {row.similarity.toFixed(2)}</span>
                    {row.FoodImage!.downvotes > 0 && <Badge tone="red">{row.FoodImage!.downvotes} downvotes</Badge>}
                  </div>
                  <p className="line-clamp-2 text-zinc-500">{row.FoodImage!.imageDescription}</p>
                </li>
              ))}
            </ul>
          ) : <Empty>No icon linked yet.</Empty>}
        </Card>

        <Card title="Nearest foods (by embedding)" padded={false}>
          {similar.length ? (
            <Table>
              <thead><tr><Th>Food</Th><Th>Source</Th><Th right>kcal / serving</Th><Th right>Similarity</Th></tr></thead>
              <tbody>
                {similar.map(other => (
                  <tr key={other.id}>
                    <Td><Link href={`/admin/foods/${other.id}`} className="hover:underline">{other.name}</Link>
                      <span className="text-xs text-zinc-500"> {other.brand} <span className="font-mono">#{other.id}</span></span>
                      {other.privateToUserId && <> <Badge tone="violet">private</Badge></>}</Td>
                    <Td><Badge>{other.foodInfoSource}</Badge></Td>
                    <Td right className="text-xs">{num(other.kcalPerServing)}{other.defaultServingWeightGram ? ` / ${num(other.defaultServingWeightGram)} g` : ""}</Td>
                    <Td right>{other.similarity.toFixed(3)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No embedding for this food.</Empty>}
        </Card>

        <Card title="Recent logs" padded={false} actions={usage.logs > 25 ? <span className="text-zinc-500">latest 25 of {num(usage.logs)}</span> : undefined}>
          {logRows.length ? (
            <Table>
              <thead><tr><Th>Eaten</Th><Th>User</Th><Th>Amount</Th><Th right>kcal</Th><Th>Meal</Th></tr></thead>
              <tbody>
                {logRows.map(log => (
                  <tr key={log.id} className={log.deletedAt ? "opacity-50" : undefined}>
                    <Td className="text-xs"><When value={log.consumedOn} /></Td>
                    <Td className="max-w-[10rem] truncate text-xs"><Link href={`/admin/users/${log.userId}`} className="hover:underline">{log.User?.email ?? log.userId.slice(0, 8)}</Link></Td>
                    <Td className="text-xs">{num(log.servingAmount, 2)} {log.Serving?.servingName ?? log.loggedUnit ?? "g"} <span className="text-zinc-400">({num(log.grams)} g)</span></Td>
                    <Td right>{num(log.kcal)}</Td>
                    <Td>{log.messageId ? <TextLink href={`/admin/meals/${log.messageId}`}>#{log.messageId}</TextLink> : "—"}{log.deletedAt && <> <Badge tone="red">deleted</Badge></>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>Never logged.</Empty>}
        </Card>
      </div>

      {(auditRows.length > 0 || mergedRows.length > 0 || conflictRows.length > 0 || bugRows.length > 0) && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {mergedRows.length > 0 && (
            <Card title={`Merged into this food (${mergedRows.length})`}>
              <ul className="space-y-2 text-sm">
                {mergedRows.map(row => (
                  <li key={row.id}>
                    <b>{row.before?.name ?? `#${row.rowId}`}</b> <span className="text-xs text-zinc-500">{row.before?.brand} · was #{row.rowId} · {row.audit} · <When value={row.createdAt} /></span>
                    <div className="mt-1"><Json label="Row before merge" value={row.before} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {auditRows.length > 0 && (
            <Card title={`Audit history (${auditRows.length})`}>
              <div className="space-y-2">
                {auditRows.map(row => <Json key={row.id} value={row.before} label={<>{row.audit} · <When value={row.createdAt} /></>} />)}
              </div>
            </Card>
          )}
          {conflictRows.length > 0 && (
            <Card title={`Source conflicts (${conflictRows.length})`}>
              <div className="space-y-2">
                {conflictRows.map(row => <Json key={row.id} value={{ existing: row.existing, proposed: row.proposed }} label={<>{row.source} · <When value={row.createdAt} /></>} />)}
              </div>
            </Card>
          )}
          {bugRows.length > 0 && (
            <Card title={`User reports (${bugRows.length})`}>
              <ul className="space-y-1.5 text-sm">
                {bugRows.map(bug => (
                  <li key={bug.id}>
                    <Badge tone="red">{bug.bug_type ?? "report"}</Badge> {bug.extra_details}
                    <span className="text-xs text-zinc-500"> · <When value={bug.created_at} />{bug.message_id && <> · <TextLink href={`/admin/meals/${bug.message_id}`}>meal #{bug.message_id}</TextLink></>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
