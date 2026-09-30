import Link from "next/link"
import { num } from "../_lib/format"
import type { UserListRow } from "../_lib/types"
import { Badge, SortTh, Table, Td, Th, When } from "../_components/ui"

export const USER_SORTS: [string, string][] = [["", "Last active"], ["meals_7d", "Meals, 7 days"], ["meals_30d", "Meals, 30 days"],
  ["meals", "Meals, all time"], ["foods_30d", "Foods logged, 30 days"], ["foods", "Foods logged, all time"],
  ["failed", "Failed meals, 30 days"], ["first", "Newest users"], ["email", "Email"]]

/** Users as rows. With sortHref, the activity headers sort the list (largest first). */
export function UserTable({ rows, sort, sortHref }: { rows: UserListRow[]; sort?: string; sortHref?: (sort: string) => string }) {
  const header = (label: string, key: string, right = true) =>
    sortHref ? <SortTh label={label} sort={key} current={sort} href={sortHref} right={right} /> : <Th right={right}>{label}</Th>
  return (
    <Table>
      <thead>
        <tr>
          {header("User", "email", false)}<Th>Time zone</Th><Th>Plan</Th>{header("Last meal", "recent", false)}
          {header("Meals 7 d", "meals_7d")}{header("Meals 30 d", "meals_30d")}{header("Meals", "meals")}
          {header("Foods 30 d", "foods_30d")}{header("Foods", "foods")}{header("Failed 30 d", "failed")}{header("First meal", "first", false)}
        </tr>
      </thead>
      <tbody>
        {rows.map(user => (
          <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
            <Td>
              <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">{user.email ?? user.id}</Link>
              {user.fullName && <div className="text-xs text-zinc-500">{user.fullName}</div>}
            </Td>
            <Td className="text-xs">{user.tzIdentifier}</Td>
            <Td>{user.subscriptionType ? <Badge>{user.subscriptionType}</Badge> : <span className="text-zinc-400">—</span>}</Td>
            <Td className="text-xs text-zinc-500"><When value={user.lastMessageAt} /></Td>
            <Td right>{num(user.meals7d)}</Td>
            <Td right>{num(user.meals30d)}</Td>
            <Td right>{num(user.totalMeals)}</Td>
            <Td right>{num(user.foods30d)}</Td>
            <Td right>{num(user.totalFoods)}</Td>
            <Td right>{user.failed30d ? <Link href={`/admin/meals?user=${user.id}&state=failed`} className="text-red-700 hover:underline dark:text-red-400">{user.failed30d}</Link> : "0"}</Td>
            <Td className="text-xs text-zinc-500"><When value={user.firstMessageAt} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
