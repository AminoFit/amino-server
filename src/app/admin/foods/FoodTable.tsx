import Link from "next/link"
import { num } from "../_lib/format"
import type { FoodListRow } from "../_lib/types"
import { Badge, FoodIcon, Table, Td, Th, When } from "../_components/ui"

export function FoodTable({ rows }: { rows: FoodListRow[] }) {
  return (
    <Table>
      <thead>
        <tr><Th>Food</Th><Th>Source</Th><Th right>Serving</Th><Th right>kcal</Th><Th right>P / C / F</Th><Th right>Logs</Th><Th right>Users</Th><Th>Last logged</Th><Th>Added</Th></tr>
      </thead>
      <tbody>
        {rows.map(food => (
          <tr key={food.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
            <Td>
              <Link href={`/admin/foods/${food.id}`} className="flex items-center gap-2">
                <FoodIcon src={food.icon} size={32} />
                <span className="min-w-0">
                  <span className="block font-medium hover:underline">{food.name}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                    {food.brand && <span>{food.brand}</span>}
                    <span className="font-mono">#{food.id}</span>
                    {food.gtin && <span className="font-mono">· {food.gtin}</span>}
                    {food.privateToUserId && <Badge tone="violet">private</Badge>}
                    {food.verified && <Badge tone="green">verified</Badge>}
                    {!food.icon && <Badge tone="amber">no icon</Badge>}
                  </span>
                </span>
              </Link>
            </Td>
            <Td><Badge>{food.foodInfoSource}</Badge></Td>
            <Td right className="text-xs">{food.defaultServingWeightGram ? `${num(food.defaultServingWeightGram)} g` : "—"}</Td>
            <Td right>{num(food.kcalPerServing)}</Td>
            <Td right className="whitespace-nowrap text-xs">{num(food.proteinPerServing, 1)} / {num(food.carbPerServing, 1)} / {num(food.totalFatPerServing, 1)}</Td>
            <Td right>{num(food.logs)}</Td>
            <Td right>{num(food.users)}</Td>
            <Td className="text-xs text-zinc-500"><When value={food.lastLogged} /></Td>
            <Td className="text-xs text-zinc-500"><When value={food.createdAtDateTime} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
