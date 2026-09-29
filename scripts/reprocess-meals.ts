// Re-resolve published meals from scratch with the current pipeline: each becomes a "replace" operation (a new nonce,
// so it is not mistaken for an app retry; fresh, so the old plan is not shown) processed here and published atomically.
// Run with production credentials:
// npx ts-node -T -r tsconfig-paths/register scripts/reprocess-meals.ts <messageId...>
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { takeOverMessage } from "@/mealOperations/takeover"
import { processMealOperation } from "@/mealOperations/worker"

void (async () => {
  const ids = process.argv.slice(2).map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
  if (!ids.length) throw new Error("Give message IDs")
  const db = createAdminSupabase()
  for (const id of ids) {
    const { data: message, error } = await db.from("Message").select("*").eq("id", id).is("deletedAt", null).single()
    if (error || !message) { console.log(JSON.stringify({ messageId: id, error: "message unavailable" })); continue }
    const { data: user } = await db.from("User").select("id,tzIdentifier").eq("id", message.userId).single()
    let operationId: string | undefined
    await takeOverMessage(user!, message, new Date(`${message.consumedOn ?? message.createdAt}Z`).toISOString(), true, {
      nonce: `reprocess:${Date.now()}`, fresh: true,
      accept: async (userId, request) => {
        const { acceptMealOperation } = await import("@/mealOperations/service")
        const accepted = await acceptMealOperation(userId, request)
        operationId = accepted.operationId
        return accepted
      },
      // Processed below, in this process, instead of through the queue.
      dispatch: async () => true })
    const result = operationId ? await processMealOperation(operationId) : { state: "not_accepted" }
    const { data: foods } = await db.from("LoggedFoodItem").select("foodItemId,grams,kcal,proteinG,carbG,totalFatG,FoodItem(name)")
      .eq("messageId", id).is("deletedAt", null).order("id")
    console.log(JSON.stringify({ messageId: id, operationId, result, foods: (foods ?? []).map((food: any) =>
      `${food.FoodItem?.name} ${Math.round(food.grams)} g ${Math.round(food.kcal)} kcal P${food.proteinG?.toFixed(1)} C${food.carbG?.toFixed(1)} F${food.totalFatG?.toFixed(1)}`) }))
  }
})()
