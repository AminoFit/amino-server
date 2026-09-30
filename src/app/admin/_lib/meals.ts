import { adminDb, must, rpc, signPhotos } from "./db"
import type { MealListRow } from "./types"

export type MealFilters = { userId?: string; kind?: string; state?: string; route?: string; q?: string
  from?: string; to?: string; dateField?: "created" | "consumed"; deleted?: string; sort?: string }

/** One page of meals, the number of matching meals (counted by the same query) and signed photo thumbnails. */
export async function listMeals(filters: MealFilters, page: number, perPage: number, withPhotos = true) {
  const rows = await rpc<MealListRow[]>("admin_meals", {
    p_user_id: filters.userId ?? null, p_kind: filters.kind ?? null, p_state: filters.state ?? null,
    p_route: filters.route ?? null, p_query: filters.q ?? null, p_from: filters.from ?? null, p_to: filters.to ?? null,
    p_date_field: filters.dateField ?? "created", p_deleted: filters.deleted ?? "hide", p_sort: filters.sort ?? "newest",
    p_limit: perPage, p_offset: (page - 1) * perPage
  })
  const meals = rows, total = rows[0]?.total ?? 0
  return { meals, total, hasMore: page * perPage < total, photos: withPhotos ? await mealPhotos(meals.filter(meal => meal.photos).map(meal => meal.id)) : new Map() }
}

/** Signed photo URLs per message, with one table read and one storage call for the whole page. */
export async function mealPhotos(messageIds: number[]): Promise<Map<number, string[]>> {
  if (!messageIds.length) return new Map()
  const images = must("UserMessageImages", await adminDb().from("UserMessageImages").select("messageId,imagePath")
    .in("messageId", messageIds).order("id")) as { messageId: number; imagePath: string }[]
  const signed = await signPhotos(images.map(image => image.imagePath))
  const byMessage = new Map<number, string[]>()
  for (const image of images) {
    const url = signed.get(image.imagePath)
    if (url) byMessage.set(image.messageId, [...(byMessage.get(image.messageId) ?? []), url])
  }
  return byMessage
}
