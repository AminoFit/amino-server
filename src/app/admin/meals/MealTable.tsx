import Link from "next/link"
import classNames from "classnames"
import { ms, num } from "../_lib/format"
import type { MealListRow } from "../_lib/types"
import { KindBadge } from "../_components/kinds"
import { Badge, RouteBadge, StateBadge, Table, Td, Th, When } from "../_components/ui"

/** Meals as rows: what the user sent, what was logged, and how the resolution went. Each row opens the meal. */
export function MealTable({ rows, photos, compact = false, showUser = true }: { rows: MealListRow[]
  photos?: Map<number, string[]>; compact?: boolean; showUser?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Meal</Th>
          <Th>Sent</Th>
          {showUser && <Th>User</Th>}
          <Th>Input</Th>
          {!compact && <Th>Logged</Th>}
          <Th>Result</Th>
          <Th right>Time</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className={classNames("hover:bg-zinc-50 dark:hover:bg-zinc-800/40", row.deletedAt && "opacity-60")}>
            <Td mono><Link href={`/admin/meals/${row.id}`} className="text-sky-700 hover:underline dark:text-sky-400">#{row.id}</Link></Td>
            <Td className="text-xs text-zinc-500"><When value={row.createdAt} /></Td>
            {showUser && (
              <Td className="max-w-[12rem] truncate text-xs">
                <Link href={`/admin/users/${row.userId}`} className="hover:underline">{row.email ?? row.userId.slice(0, 8)}</Link>
              </Td>
            )}
            <Td className={compact ? "max-w-[22rem]" : "max-w-[26rem]"}>
              <Link href={`/admin/meals/${row.id}`} className="block">
                <div className="mb-1 flex flex-wrap items-center gap-1">
                  <KindBadge photos={row.photos} isAudio={row.isAudio} content={row.content} route={row.route} />
                  {row.deletedAt && <Badge tone="red">deleted</Badge>}
                </div>
                {row.content.trim() ? <p className={classNames("text-sm", compact ? "line-clamp-1" : "line-clamp-2")}>{row.content}</p> :
                  !photos?.get(row.id)?.length && <p className="text-xs italic text-zinc-400">no text</p>}
                {photos?.get(row.id)?.length ? (
                  <div className="mt-1 flex gap-1">
                    {photos.get(row.id)!.slice(0, 4).map(url => <img key={url} src={url} alt="" loading="lazy" className="h-12 w-12 rounded object-cover" />)}
                  </div>
                ) : null}
              </Link>
            </Td>
            {!compact && (
              <Td className="max-w-[24rem] text-xs">
                {row.foods.length ? (
                  <ul className="space-y-0.5">
                    {row.foods.slice(0, 5).map(food => (
                      <li key={food.id} className="flex gap-1.5">
                        {food.foodId ? <Link href={`/admin/foods/${food.foodId}`} className="truncate hover:underline">{food.name ?? `food ${food.foodId}`}</Link> :
                          <span className="truncate text-zinc-400">no food</span>}
                        <span className="shrink-0 tabular-nums text-zinc-400">{Math.round(food.grams)} g · {num(food.kcal)} kcal</span>
                      </li>
                    ))}
                    {row.foods.length > 5 && <li className="text-zinc-400">+{row.foods.length - 5} more</li>}
                  </ul>
                ) : <span className="text-zinc-400">—</span>}
                {row.kcal != null && row.foods.length > 1 && <div className="mt-1 font-medium tabular-nums">{num(row.kcal)} kcal total</div>}
              </Td>
            )}
            <Td>
              <div className="flex flex-col items-start gap-1">
                <StateBadge state={row.opState ?? (row.opId ? null : row.status)} />
                <RouteBadge route={row.route} />
                {row.errorCode && <code className="text-[11px] text-red-700 dark:text-red-400">{row.errorCode}</code>}
                {(row.attempts ?? 0) > 1 && <Badge tone="amber">{row.attempts} attempts</Badge>}
                {row.edits > 0 && <Badge tone="violet">edited ×{row.edits}</Badge>}
              </div>
            </Td>
            <Td right className="text-xs">{ms(row.durationMs)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
