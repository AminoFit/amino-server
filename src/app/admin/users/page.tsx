import { requireAdmin } from "../_lib/auth"
import { rpc } from "../_lib/db"
import { param, withParams, type Params } from "../_lib/format"
import type { UserListRow } from "../_lib/types"
import { Card, Empty, Field, FilterForm, Input, PageHeader, Pager, Select } from "../_components/ui"
import { UserTable, USER_SORTS } from "./UserTable"

const PER_PAGE = 100

export default async function UsersPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const q = param(searchParams, "q"), sort = param(searchParams, "sort")
  const page = Math.max(1, Number(param(searchParams, "page")) || 1)
  const users = await rpc<UserListRow[]>("admin_users", { p_query: q ?? null, p_sort: sort ?? "recent", p_limit: PER_PAGE,
    p_offset: (page - 1) * PER_PAGE })
  return (
    <>
      <PageHeader title="Users" subtitle="Most recently active first; click a column to sort by it. Open a user for their stats and their log day by day." />
      <FilterForm action="/admin/users">
        <Field label="Email, name or ID"><Input name="q" value={q} className="w-72" /></Field>
        <Field label="Sort"><Select name="sort" value={sort} options={USER_SORTS} /></Field>
      </FilterForm>
      <Card padded={false}>
        {users.length ? <UserTable rows={users} sort={sort ?? "recent"} sortHref={next => withParams("/admin/users", searchParams, { sort: next, page: undefined })} /> :
          <Empty>No users match.</Empty>}
        <Pager page={page} perPage={PER_PAGE} total={users[0]?.total ?? 0} href={n => withParams("/admin/users", searchParams, { page: n })} />
      </Card>
    </>
  )
}
