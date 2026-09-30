import Link from "next/link"
import { requireAdmin } from "../_lib/auth"
import { adminDb, must } from "../_lib/db"
import { foodIcons } from "../_lib/foods"
import { param, withParams, type Params } from "../_lib/format"
import { Badge, Card, Empty, Field, FilterForm, FoodIcon, Json, PageHeader, Pager, Select, Table, Td, TextLink, Th, When } from "../_components/ui"

const PER_PAGE = 50

type Bug = { id: number; bug_type: string | null; created_at: string; created_by_user: string; extra_details: string | null
  food_item_id: number | null; logged_food_id: number | null; message_id: number | null
  FoodItem: { name: string; brand: string | null } | null }

export default async function ReportsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const page = Math.max(1, Number(param(searchParams, "page")) || 1)
  const type = param(searchParams, "type")
  const db = adminDb()
  let query = db.from("userSubmittedBug").select("*,FoodItem(name,brand)")
    .order("created_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE)
  if (type) query = query.eq("bug_type", type)
  const [bugs, conflicts] = await Promise.all([
    query,
    db.from("FoodItemConflict").select("id,foodItemId,source,existing,proposed,createdAt,FoodItem(name,brand)").order("id", { ascending: false }).limit(20)
  ])
  const rows = must("userSubmittedBug", bugs) as unknown as Bug[]
  const conflictRows = must("FoodItemConflict", conflicts) as unknown as { id: number; foodItemId: number; source: string; existing: unknown
    proposed: unknown; createdAt: string; FoodItem: { name: string; brand: string | null } | null }[]
  // created_by_user has no foreign key to User, so emails come from a second read.
  const userIds = [...new Set(rows.map(row => row.created_by_user))]
  const [icons, users] = await Promise.all([
    foodIcons(rows.flatMap(row => row.food_item_id ? [row.food_item_id] : [])),
    userIds.length ? db.from("User").select("id,email").in("id", userIds).then(result => must("User", result) as { id: string; email: string | null }[]) : []
  ])
  const emails = new Map(users.map(user => [user.id, user.email]))
  return (
    <>
      <PageHeader title="Reports" subtitle="What users flagged in the app (bad match, bad icon, bad nutrition), and catalogue conflicts between sources."
        actions={<TextLink href="/admin/foods?filter=no_icon">Foods without an icon →</TextLink>} />
      <FilterForm action="/admin/reports">
        <Field label="Type"><Select name="type" value={type} options={[["", "All reports"], ["bad_match", "Bad match"], ["bad_food_icon", "Bad icon"], ["bad_food_info", "Bad nutrition"]]} /></Field>
      </FilterForm>
      <Card title="User reports" padded={false}>
        {rows.length ? (
          <Table>
            <thead><tr><Th>When</Th><Th>Type</Th><Th>Food</Th><Th>Details</Th><Th>User</Th><Th>Meal</Th></tr></thead>
            <tbody>
              {rows.slice(0, PER_PAGE).map(bug => (
                <tr key={bug.id}>
                  <Td className="text-xs text-zinc-500"><When value={bug.created_at} /></Td>
                  <Td><Badge tone={bug.bug_type === "bad_food_icon" ? "amber" : "red"}>{bug.bug_type ?? "other"}</Badge></Td>
                  <Td>
                    {bug.food_item_id ? (
                      <Link href={`/admin/foods/${bug.food_item_id}`} className="flex items-center gap-2 hover:underline">
                        <FoodIcon src={icons.get(bug.food_item_id)} />
                        <span>{bug.FoodItem?.name ?? `#${bug.food_item_id}`} <span className="text-xs text-zinc-500">{bug.FoodItem?.brand}</span></span>
                      </Link>
                    ) : "—"}
                  </Td>
                  <Td className="max-w-[24rem] text-sm">{bug.extra_details ?? <span className="text-zinc-400">—</span>}</Td>
                  <Td className="max-w-[12rem] truncate text-xs"><Link href={`/admin/users/${bug.created_by_user}`} className="hover:underline">{emails.get(bug.created_by_user) ?? bug.created_by_user.slice(0, 8)}</Link></Td>
                  <Td>{bug.message_id ? <TextLink href={`/admin/meals/${bug.message_id}`}>#{bug.message_id}</TextLink> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <Empty>No reports.</Empty>}
        <Pager label={`Page ${page}`} prev={page > 1 ? withParams("/admin/reports", searchParams, { page: page - 1 }) : undefined}
          next={rows.length > PER_PAGE ? withParams("/admin/reports", searchParams, { page: page + 1 }) : undefined} />
      </Card>
      <Card className="mt-5" title="Latest source conflicts" padded={false}>
        {conflictRows.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {conflictRows.map(row => (
              <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/foods/${row.foodItemId}`} className="font-medium hover:underline">{row.FoodItem?.name ?? `#${row.foodItemId}`}</Link>
                  <span className="text-xs text-zinc-500">{row.FoodItem?.brand}</span>
                  <Badge>{row.source}</Badge>
                  <span className="ml-auto text-xs text-zinc-500"><When value={row.createdAt} /></span>
                </div>
                <Json label="Existing vs proposed" value={{ existing: row.existing, proposed: row.proposed }} />
              </li>
            ))}
          </ul>
        ) : <Empty>No conflicts recorded.</Empty>}
      </Card>
    </>
  )
}
