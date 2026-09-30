import { redirect } from "next/navigation"
import { requireAdmin } from "../_lib/auth"
import { adminDb, must, rpc } from "../_lib/db"
import { listMeals } from "../_lib/meals"
import { param, UUID, type Params } from "../_lib/format"
import type { FoodListRow, UserListRow } from "../_lib/types"
import { Card, Empty, PageHeader, TextLink } from "../_components/ui"
import { FoodTable } from "../foods/FoodTable"
import { MealTable } from "../meals/MealTable"
import { UserTable } from "../users/UserTable"

/** One box for everything: a UUID opens its user or meal operation; digits look for a food, a meal and a barcode;
 * text searches foods, users and meal text together. */
export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const q = param(searchParams, "q")
  if (!q) redirect("/admin")
  if (UUID.test(q)) {
    const db = adminDb()
    const [user, operation] = await Promise.all([
      db.from("User").select("id").eq("id", q).maybeSingle(),
      db.from("MealOperation").select("messageId").eq("id", q).maybeSingle()
    ])
    if (must("User", user)) redirect(`/admin/users/${q}`)
    const op = must("MealOperation", operation) as { messageId: number } | null
    if (op) redirect(`/admin/meals/${op.messageId}`)
  }
  const [foods, users, meals] = await Promise.all([
    rpc<FoodListRow[]>("admin_search_foods", { p_query: q.slice(0, 100), p_limit: 10 }),
    rpc<UserListRow[]>("admin_users", { p_query: q, p_limit: 10 }),
    listMeals({ q }, 1, 10)
  ])
  return (
    <>
      <PageHeader title={<>Search: “{q}”</>} subtitle="Foods by name, brand, ID or barcode; users by email, name or ID; meals by text or ID." />
      <div className="space-y-5">
        <Card title={`Foods (${foods.length}${foods.length === 10 ? "+" : ""})`} padded={false}
          actions={<TextLink href={`/admin/foods?q=${encodeURIComponent(q)}`}>All matching foods →</TextLink>}>
          {foods.length ? <FoodTable rows={foods} /> : <Empty>No foods.</Empty>}
        </Card>
        <Card title={`Meals (${meals.meals.length}${meals.hasMore ? "+" : ""})`} padded={false}
          actions={<TextLink href={`/admin/meals?q=${encodeURIComponent(q)}`}>All matching meals →</TextLink>}>
          {meals.meals.length ? <MealTable rows={meals.meals} photos={meals.photos} /> : <Empty>No meals.</Empty>}
        </Card>
        <Card title={`Users (${users.length})`} padded={false}>
          {users.length ? <UserTable rows={users} /> : <Empty>No users.</Empty>}
        </Card>
      </div>
    </>
  )
}
