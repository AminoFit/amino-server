import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// The safety net for food icons: a food can end up without one (a queue job that failed, or a path that didn't queue
// one, as the camera's barcode lookup didn't until 2026-10-02). Hourly, the newest foods without an icon are queued
// again, a few at a time (the queue keeps one job per food, so a pending one isn't doubled).

type Db=ReturnType<typeof createAdminSupabase>
const PER_RUN=25

export async function queueMissingFoodIcons(options:{db?:Db;enqueue?:(foodId:number)=>Promise<unknown>;limit?:number}={}) {
  const db=options.db??createAdminSupabase()
  const {data,error}=await db.from("FoodItem").select("id,FoodItemImages()").is("FoodItemImages",null)
    .is("archivedAt",null).order("id",{ascending:false}).limit(options.limit??PER_RUN)
  if (error) throw error
  const enqueue=options.enqueue??(async(foodId:number)=>
    (await import("@/app/api/queues/generate-food-icon/generate-food-icon")).enqueueFoodIcon(foodId))
  const ids=(data??[]).map(row=>(row as {id:number}).id)
  let queued=0
  for (const id of ids) {
    try {await enqueue(id);queued++}
    catch (queueError) {console.error("food_icon_sweep_enqueue_failed",{foodId:id,queueError})}
  }
  return {missing:ids.length,queued}
}
