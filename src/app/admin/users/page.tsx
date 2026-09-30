import { requireAdmin } from "../_lib/auth"
import { rpc } from "../_lib/db"
import { param, type Params } from "../_lib/format"
import type { UserListRow } from "../_lib/types"
import { Card, Empty, Field, FilterForm, Input, PageHeader } from "../_components/ui"
import { UserTable } from "./UserTable"

export default async function UsersPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const q = param(searchParams, "q")
  const users = await rpc<UserListRow[]>("admin_users", { p_query: q ?? null, p_limit: 300 })
  return (
    <>
      <PageHeader title="Users" subtitle="Most recently active first. Open a user for their stats and their log day by day." />
      <FilterForm action="/admin/users">
        <Field label="Email, name or ID"><Input name="q" value={q} className="w-72" /></Field>
      </FilterForm>
      <Card padded={false}>{users.length ? <UserTable rows={users} /> : <Empty>No users match.</Empty>}</Card>
    </>
  )
}
