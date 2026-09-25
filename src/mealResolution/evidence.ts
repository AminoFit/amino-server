import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { HISTORY_NUTRIENTS, type HistoryNutrition } from "@/foodResolution/history/nutrients"

export type CatalogFood = {
  id:number;name:string;brand:string|null;lastUpdated:string;
  defaultServingWeightGram:number|null;weightUnknown:boolean;
  kcalPerServing:number|null;proteinPerServing:number|null;carbPerServing:number|null;totalFatPerServing:number|null;
  satFatPerServing:number|null;transFatPerServing:number|null;fiberPerServing:number|null;
  sugarPerServing:number|null;addedSugarPerServing:number|null;
  Serving:{id:number;foodItemId:number;servingName:string;servingWeightGram:number|null;defaultServingAmount:number|null}[]
}
export type HistoricalFood = {
  id:number;updatedAt:string;foodItemId:number;name:string;brand:string|null;
  grams:number;kcal:number;nutrition:HistoryNutrition;
  servingId:number|null;servingAmount:number|null;loggedUnit:string|null;
  groupId:string|null
}
export type MealEvent = {messageId:number;revision:number;originalText:string;consumedOn:string;
  hasimages:boolean;foods:HistoricalFood[];groups:unknown[]}

const catalogColumns = "id,name,brand,lastUpdated,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,satFatPerServing,transFatPerServing,fiberPerServing,sugarPerServing,addedSugarPerServing,Serving(id,foodItemId,servingName,servingWeightGram,defaultServingAmount)"
const historyColumns = `id,updatedAt,foodItemId,grams,${HISTORY_NUTRIENTS.join(",")},servingId,servingAmount,loggedUnit,extendedOpenAiData,FoodItem(id,name,brand)`

export function createMealEvidence(userId:string, signal:AbortSignal,
  db = createAdminSupabase()) {
  const discovered = new Set<number>()
  const foods = new Map<number,CatalogFood>()
  const events = new Map<number,MealEvent>()
  return {
    foods,events,
    async searchFoods(query:string,cursor=0) {
      const text=query.trim().slice(0,100)
      if (!text) return {status:"empty" as const,candidates:[],nextCursor:null}
      const result=await (db as any).rpc("search_meal_food_catalogue",{
        p_query:text,p_limit:20,p_offset:cursor}).abortSignal(signal)
      if (result.error) throw new Error("catalogue_unavailable")
      const candidates=((result.data??[]) as {id:number;name:string;brand:string|null;knownAs:string[]|null}[])
        .map(row=>({id:row.id,name:row.name,brand:row.brand,knownAs:row.knownAs}))
      for (const candidate of candidates) discovered.add(candidate.id)
      return {status:candidates.length?"ok" as const:"empty" as const,candidates,
        nextCursor:candidates.length===20?cursor+20:null}
    },
    async getFoodsAndServings(ids:number[]) {
      const allowed=[...new Set(ids)].filter(id=>Number.isSafeInteger(id)&&discovered.has(id)).slice(0,20)
      const missing=allowed.filter(id=>!foods.has(id))
      if (missing.length) {
        const result=await db.from("FoodItem").select(catalogColumns).in("id",missing)
          .limit(31,{foreignTable:"Serving"}).abortSignal(signal)
        if (result.error) throw new Error("food_details_unavailable")
        for (const row of result.data??[]) {
          const food=row as unknown as CatalogFood
          foods.set(food.id,{...food,Serving:food.Serving.slice(0,30)})
        }
      }
      return {status:"ok" as const,foods:allowed.flatMap(id=>foods.has(id)?[foods.get(id)!]:[]),
        missingIds:allowed.filter(id=>!foods.has(id))}
    },
    async listMealEvents(from:string,to:string,cursor=0) {
      if (!Number.isInteger(cursor)||cursor<0||cursor>200||!Number.isFinite(Date.parse(from))||
        !Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)) throw new Error("invalid_history_window")
      const result=await db.from("Message").select("id,content,consumedOn,itemsToProcess,publishedRevision")
        .eq("userId",userId).eq("status","RESOLVED").is("deletedAt",null)
        .gte("consumedOn",from).lt("consumedOn",to)
        .order("consumedOn",{ascending:false}).order("id",{ascending:false})
        .range(cursor,cursor+20).abortSignal(signal)
      if (result.error) throw new Error("history_unavailable")
      return {status:"ok" as const,events:((result.data??[]) as any[]).slice(0,20).map(row=>({
        messageId:row.id,originalText:row.content,consumedOn:row.consumedOn,
        foodCount:row.itemsToProcess,revision:row.publishedRevision})),
        nextCursor:(result.data?.length??0)>20?cursor+20:null}
    },
    async getMealEvent(messageId:number) {
      if (!Number.isSafeInteger(messageId)||messageId<=0) throw new Error("invalid_history_id")
      if (events.has(messageId)) return {status:"ok" as const,event:events.get(messageId)!}
      const message=await db.from("Message").select("id,userId,content,consumedOn,hasimages,publishedRevision,itemsToProcess,itemsProcessed")
        .eq("id",messageId).eq("userId",userId).eq("status","RESOLVED").is("deletedAt",null)
        .abortSignal(signal).maybeSingle()
      if (message.error) throw new Error("history_unavailable")
      const source=message.data as any
      if (!source||!source.consumedOn||!source.itemsToProcess||source.itemsToProcess!==source.itemsProcessed)
        return {status:"unavailable" as const}
      const logged=await db.from("LoggedFoodItem").select(historyColumns)
        .eq("messageId",messageId).eq("userId",userId).eq("status","Processed")
        .is("deletedAt",null).order("id").limit(31).abortSignal(signal)
      if (logged.error) throw new Error("history_unavailable")
      if (!logged.data||logged.data.length!==source.itemsToProcess||logged.data.length>30)
        return {status:"unavailable" as const}
      const rows=logged.data as unknown as (Omit<HistoricalFood,"name"|"brand"|"groupId">&{
        extendedOpenAiData:Record<string,unknown>|null;FoodItem:{id:number;name:string;brand:string|null}|null})[]
      if (rows.some(row=>!row.FoodItem||!Number.isFinite(row.grams)||row.grams<=0||
        !Number.isFinite(row.kcal)||row.kcal<0)) return {status:"unavailable" as const}
      const foodsForEvent=rows.map(row=>({id:row.id,updatedAt:row.updatedAt,
        foodItemId:row.foodItemId,name:row.FoodItem!.name,brand:row.FoodItem!.brand,
        grams:row.grams,kcal:row.kcal,
        nutrition:Object.fromEntries(HISTORY_NUTRIENTS.map(key=>[key,(row as any)[key]])) as HistoryNutrition,
        servingId:row.servingId,servingAmount:row.servingAmount,loggedUnit:row.loggedUnit,
        groupId:typeof row.extendedOpenAiData?.groupId==="string"?row.extendedOpenAiData.groupId:null}))
      for (const row of foodsForEvent) discovered.add(row.foodItemId)
      let groups:unknown[]=[]
      if (source.publishedRevision>0) {
        const revision=await db.from("MealRevision" as any).select("snapshot")
          .eq("messageId",messageId).eq("revision",source.publishedRevision).maybeSingle()
        if (revision.error) throw new Error("history_revision_unavailable")
        groups=Array.isArray((revision.data as any)?.snapshot?.groups)?(revision.data as any).snapshot.groups:[]
      }
      const event:MealEvent={messageId,revision:source.publishedRevision,originalText:source.content,
        consumedOn:source.consumedOn,hasimages:source.hasimages,foods:foodsForEvent,groups}
      events.set(messageId,event)
      return {status:"ok" as const,event}
    }
  }
}
