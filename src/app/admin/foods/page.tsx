import { requireAdmin } from "../_lib/auth"
import { rpc } from "../_lib/db"
import { SOURCE_OPTIONS } from "../_lib/foods"
import { param, withParams, type Params } from "../_lib/format"
import type { FoodListRow } from "../_lib/types"
import { Card, Empty, Field, FilterForm, Input, PageHeader, Pager, Select } from "../_components/ui"
import { FoodTable } from "./FoodTable"

const PER_PAGE = 50

export default async function FoodsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin()
  const page = Math.max(1, Number(param(searchParams, "page")) || 1)
  const q = param(searchParams, "q")
  const rows = await rpc<FoodListRow[]>("admin_search_foods", {
    p_query: q ?? null, p_source: param(searchParams, "source") ?? null, p_filter: param(searchParams, "filter") ?? null,
    p_sort: param(searchParams, "sort") ?? "relevance", p_limit: PER_PAGE + 1, p_offset: (page - 1) * PER_PAGE
  })
  const foods = rows.slice(0, PER_PAGE)
  return (
    <>
      <PageHeader title="Foods" subtitle="The whole catalogue, private foods included. Search by name (typo tolerant), brand, food ID or barcode." />
      <FilterForm action="/admin/foods">
        <Field label="Name, brand, ID or barcode"><Input name="q" value={q} placeholder="e.g. greek yogurt" className="w-72" /></Field>
        <Field label="Source"><Select name="source" value={param(searchParams, "source")} options={SOURCE_OPTIONS} /></Field>
        <Field label="Show"><Select name="filter" value={param(searchParams, "filter")} options={[["", "All foods"], ["shared", "Shared catalogue"],
          ["private", "Private foods"], ["unverified", "Unverified"], ["gtin", "With a barcode"], ["no_icon", "Without an icon"],
          ["reported", "Reported by users"], ["conflicts", "With source conflicts"]]} /></Field>
        <Field label="Sort"><Select name="sort" value={param(searchParams, "sort")} options={[["", q ? "Best match" : "Newest"], ["newest", "Newest"],
          ["oldest", "Oldest"], ["name", "Name"]]} /></Field>
      </FilterForm>
      <Card padded={false}>
        {foods.length ? <FoodTable rows={foods} /> : <Empty>No foods match.</Empty>}
        <Pager label={`Page ${page}`} prev={page > 1 ? withParams("/admin/foods", searchParams, { page: page - 1 }) : undefined}
          next={rows.length > PER_PAGE ? withParams("/admin/foods", searchParams, { page: page + 1 }) : undefined} />
      </Card>
    </>
  )
}
