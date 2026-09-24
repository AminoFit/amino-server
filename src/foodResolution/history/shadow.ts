import { foodMetric, currentFoodConfig } from "../telemetry"
import { createUserFoodHistorySearch, HistoryRequest, HistoryResult } from "./search"

// The caller overlaps this bounded read with extraction and joins it before the
// request ends. No unawaited work is lost when a serverless invocation freezes.
export async function shadowFoodHistory(user: { id: string; tzIdentifier: string }, request: HistoryRequest,
  search = createUserFoodHistorySearch): Promise<void> {
  if (currentFoodConfig()?.features.history_search !== "shadow") return
  const start = performance.now()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_,reject)=>{
      timer = setTimeout(()=>{controller.abort();reject(new Error("History deadline exceeded"))},750)
    })
    const result: HistoryResult = await Promise.race([search(user)(request,controller.signal),deadline])
    foodMetric("history_shadow",performance.now()-start,"ok",{
      status: result.disposition, historyCandidateCount: result.candidates.length,
      historySourceMessageIds: result.candidates.map(candidate=>candidate.messageId),
      historyFoodIds: [...new Set(result.candidates.flatMap(candidate=>candidate.foods.map(food=>food.foodItemId!)))],
      historyTruncated: result.truncated
    })
  } catch {
    foodMetric("history_shadow",performance.now()-start,"error",{status:"unavailable"})
  } finally { clearTimeout(timer) }
}
