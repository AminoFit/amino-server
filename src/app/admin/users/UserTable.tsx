import Link from "next/link"
import { num } from "../_lib/format"
import type { UserListRow } from "../_lib/types"
import { Badge, Table, Td, Th, When } from "../_components/ui"

export function UserTable({ rows }: { rows: UserListRow[] }) {
  return (
    <Table>
      <thead>
        <tr><Th>User</Th><Th>Time zone</Th><Th>Plan</Th><Th>Last meal</Th><Th right>7 d</Th><Th right>30 d</Th><Th right>Failed, 30 d</Th><Th right>All time</Th></tr>
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
            <Td right>{user.failed30d ? <Link href={`/admin/meals?user=${user.id}&state=failed`} className="text-red-700 hover:underline dark:text-red-400">{user.failed30d}</Link> : "0"}</Td>
            <Td right>{num(user.totalMeals)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
