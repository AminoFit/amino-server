import { requireAdmin } from "../_lib/auth"
import { listMeals } from "../_lib/meals"
import { param, withParams, UUID, type Params } from "../_lib/format"
import { Card, Empty, Field, FilterForm, Input, PageHeader, Pager, Select } from "../_components/ui"
import { MealTable } from "./MealTable"
import { KIND_OPTIONS, ROUTE_OPTIONS, STATE_OPTIONS } from "./options"

const PER_PAGE = 40

export default async function MealsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const page = Math.max(1, Number(param(searchParams, "page")) || 1)
  const user = param(searchParams, "user")
  const from = param(searchParams, "from"), to = param(searchParams, "to")
  const { meals, hasMore, photos } = await listMeals({
    userId: user && UUID.test(user) ? user : undefined, kind: param(searchParams, "kind"), state: param(searchParams, "state"),
    route: param(searchParams, "route"), q: param(searchParams, "q"),
    from: from ? `${from}T00:00:00Z` : undefined, to: to ? `${to}T23:59:59.999Z` : undefined,
    dateField: param(searchParams, "date") === "consumed" ? "consumed" : "created", deleted: param(searchParams, "deleted") ?? "hide"
  }, page, PER_PAGE)
  return (
    <>
      <PageHeader title="Meals" subtitle="Every meal a user sent, newest first, with how it was resolved. Open a meal for its full trace." />
      <FilterForm action="/admin/meals">
        <Field label="Text or meal ID"><Input name="q" value={param(searchParams, "q")} placeholder="e.g. oatmeal" /></Field>
        <Field label="User ID"><Input name="user" value={user} placeholder="uuid" className="w-72" /></Field>
        <Field label="Input"><Select name="kind" value={param(searchParams, "kind")} options={KIND_OPTIONS} /></Field>
        <Field label="State"><Select name="state" value={param(searchParams, "state")} options={STATE_OPTIONS} /></Field>
        <Field label="Route"><Select name="route" value={param(searchParams, "route")} options={ROUTE_OPTIONS} /></Field>
        <Field label="From (UTC)"><Input name="from" type="date" value={from} /></Field>
        <Field label="To"><Input name="to" type="date" value={to} /></Field>
        <Field label="Dates are"><Select name="date" value={param(searchParams, "date")} options={[["", "Sent"], ["consumed", "Eaten"]]} /></Field>
        <Field label="Deleted"><Select name="deleted" value={param(searchParams, "deleted")} options={[["", "Hide"], ["all", "Include"], ["only", "Only deleted"]]} /></Field>
      </FilterForm>
      <Card padded={false}>
        {meals.length ? <MealTable rows={meals} photos={photos} /> : <Empty>No meals match these filters.</Empty>}
        <Pager label={`Page ${page}`} prev={page > 1 ? withParams("/admin/meals", searchParams, { page: page - 1 }) : undefined}
          next={hasMore ? withParams("/admin/meals", searchParams, { page: page + 1 }) : undefined} />
      </Card>
    </>
  )
}
