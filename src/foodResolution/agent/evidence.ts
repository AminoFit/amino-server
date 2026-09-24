import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createUserFoodHistorySearch } from "../history/search"
import type { AgentInput, Candidate, EvidenceFood } from "./types"

const columns = "id,name,brand,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,Serving(id,foodItemId,servingName,servingWeightGram,defaultServingAmount)"
export function createAgentEvidence(input: AgentInput, signal: AbortSignal, db = createAdminSupabase()) {
  const foods = new Map<number,EvidenceFood>()
  const discovered = new Set(input.candidates.map(c=>c.id))
  const history = createUserFoodHistorySearch(input.user,db)
  return {
    foods,
    async getFoodsAndServings(foodIds: number[]): Promise<EvidenceFood[]> {
      const ids = [...new Set(foodIds)].filter(id=>Number.isSafeInteger(id) && discovered.has(id)).slice(0,20)
      const missing = ids.filter(id=>!foods.has(id))
      if (missing.length) {
        const {data,error} = await db.from("FoodItem").select(columns).in("id",missing)
          .order("id").limit(20).limit(31,{foreignTable:"Serving"}).abortSignal(signal)
        if (error) throw new Error("Serving lookup unavailable")
        for (const food of data ?? []) if (missing.includes(food.id)) foods.set(food.id,
          {...food,Serving:food.Serving.slice(0,30),servingsTruncated:food.Serving.length>30})
      }
      return ids.flatMap(id=>foods.has(id) ? [foods.get(id)!] : [])
    },
    async searchFoodCandidates(query: string): Promise<Candidate[]> {
      // A parameterized intersection avoids model-generated PostgREST expressions
      // and SQL wildcard patterns. Limit both input complexity and returned rows.
      const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0,6)
      if (!terms.length) return []
      let request = db.from("FoodItem").select("id,name,brand")
      for (const term of terms) request = request.ilike("name",`%${term}%`)
      if (input.item.brand?.trim()) request = request.ilike("brand",input.item.brand.replace(/[%_\\]/g,"\\$&"))
      const {data,error} = await request.order("id").limit(12).abortSignal(signal)
      if (error) throw new Error("Catalogue unavailable")
      for (const food of data ?? []) discovered.add(food.id)
      return data ?? []
    },
    async getFoodAndServings(foodId: number): Promise<EvidenceFood | null> {
      if (!discovered.has(foodId)) return null
      if (foods.has(foodId)) return foods.get(foodId)!
      const {data,error} = await db.from("FoodItem").select(columns).eq("id",foodId)
        .limit(31,{foreignTable:"Serving"}).abortSignal(signal).maybeSingle()
      if (error) throw new Error("Serving lookup unavailable")
      if (!data) return null
      const food = {...data,Serving:data.Serving.slice(0,30),servingsTruncated:data.Serving.length>30}
      foods.set(food.id,food)
      return food
    },
    async searchUserFoodHistory(query: string) {
      const result = await history({text:query,referenceTime:input.referenceTime,excludeMessageId:input.messageId,
        explicitBrand:input.item.brand},signal)
      // User identifiers and original conversations are omitted. History is ranking evidence, never a default.
      const candidates = result.candidates.map(c=>({messageId:c.messageId,consumedOn:c.consumedOn,
        occurrenceDays:c.occurrenceDays,foods:c.foods.slice(0,10).map(f=>({foodId:f.foodItemId!,name:f.FoodItem!.name,
          brand:f.FoodItem!.brand,grams:f.grams}))}))
      for (const candidate of candidates) for (const food of candidate.foods) discovered.add(food.foodId)
      return {disposition:result.disposition,truncated:result.truncated || result.candidates.some(c=>c.foods.length>10),candidates}
    }
  }
}
