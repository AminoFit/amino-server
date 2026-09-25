import { randomUUID } from "node:crypto"
import { foodNutrition, validNutrition } from "@/foodResolution/nutrition"
import type { MealProposal } from "@/mealOperations/contracts"
import type { MealResolutionInput, MealResolutionResult } from "./resolve"
import { HISTORY_NUTRIENTS, type HistoryNutrition } from "@/foodResolution/history/nutrients"

type Nutrition = HistoryNutrition & {kcal:number;proteinG:number|null;carbG:number|null;totalFatG:number|null}
export type PublishedItem = {logicalItemId:string;foodId:number;grams:number;
  servingId:number|null;servingAmount:number;loggedUnit:string;
  groupId:string|null;groupLabel:string|null;nutrition:Nutrition;evidence:string[];
  origin:"catalogue"|"history"|"estimate";
  assumption?:string;catalogueUpdatedAt?:string;
  sourceItemId?:{messageId:number;loggedFoodItemId:number;updatedAt:string;revision:number}}
export type PublishedPlan = {schemaVersion:1;originalText:string;consumedOn:string;
  groups:{id:string;label:string|null}[];items:PublishedItem[];claims:MealProposal["claims"];
  model:{id:string;provider:string};input:{operationId:string;submittedAt:string;timezone:string;locale:string|null}}

const positive=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>0

/** A proposal names evidence and meaning. This code only checks ownership,
 * source membership, serving arithmetic and numeric consistency. */
export function compileMealPlan(input:MealResolutionInput,result:MealResolutionResult):PublishedPlan {
  const {proposal,evidence}=result
  if (proposal.outcome!=="resolved") throw new Error("meal_needs_clarification")
  if (!Number.isFinite(Date.parse(proposal.consumedOn))) throw new Error("invalid_meal_time")
  const grouped:MealProposal["items"]=(proposal.historyGroupSelections??[]).flatMap(selection=>{
    const event=evidence.events.get(selection.sourceMessageId)
    if(!event) throw new Error("unread_history_group")
    const group=(event.groups as {id:string;label:string|null}[]).find(row=>row.id===selection.groupId)
    if(!group) throw new Error("unread_history_group")
    const members=event.foods.filter(food=>food.groupId===selection.groupId)
    const excluded=new Set(selection.excludeLoggedFoodItemIds)
    if(!members.length||[...excluded].some(id=>!members.some(food=>food.id===id)))
      throw new Error("invalid_group_exclusion")
    return members.filter(food=>!excluded.has(food.id)).map(food=>({
      foodId:food.foodItemId,
      quantity:{kind:"history" as const,sourceMessageId:event.messageId,
        sourceLoggedFoodItemId:food.id,scale:selection.scale},
      groupId:group.id,groupLabel:group.label,
      evidence:[`event:${event.messageId}:group:${group.id}`,`event:${event.messageId}:food:${food.id}`]
    }))
  })
  const proposedItems=[...grouped,...proposal.items]
  if (proposedItems.length<1||proposedItems.length>30) throw new Error("invalid_meal_size")
  const sourceKeys=new Set<string>()
  for(const item of proposedItems) if(item.quantity.kind==="history") {
    const key=`${item.quantity.sourceMessageId}:${item.quantity.sourceLoggedFoodItemId}`
    if(sourceKeys.has(key)) throw new Error("duplicate_source_food")
    sourceKeys.add(key)
  }
  const groups=new Map<string,string|null>()
  const items:PublishedItem[]=proposedItems.map(proposed=>{
    const quantity=proposed.quantity
    let foodId:number,grams:number,servingId:number|null=null,servingAmount:number,loggedUnit:string
    let nutrition:Nutrition,sourceItemId:PublishedItem["sourceItemId"]
    let catalogueUpdatedAt:string|undefined
    if (quantity.kind==="history") {
      const event=evidence.events.get(quantity.sourceMessageId)
      const row=event?.foods.find(food=>food.id===quantity.sourceLoggedFoodItemId)
      if (!event||!row||!positive(quantity.scale)||proposed.foodId!==null&&proposed.foodId!==row.foodItemId)
        throw new Error("unread_history_food")
      foodId=row.foodItemId
      grams=row.grams*quantity.scale
      nutrition=Object.fromEntries(HISTORY_NUTRIENTS.map(key=>[key,
        row.nutrition[key]==null?null:row.nutrition[key]! * quantity.scale])) as Nutrition
      if (quantity.scale===1&&row.servingId!==null&&positive(row.servingAmount)) {
        servingId=row.servingId;servingAmount=row.servingAmount;loggedUnit=row.loggedUnit??"g"
      } else {servingAmount=grams;loggedUnit="g"}
      sourceItemId={messageId:event.messageId,loggedFoodItemId:row.id,updatedAt:row.updatedAt,revision:event.revision}
    } else {
      if (!proposed.foodId) throw new Error("missing_catalogue_food")
      const food=evidence.foods.get(proposed.foodId)
      if (!food) throw new Error("unread_catalogue_food")
      foodId=food.id
      catalogueUpdatedAt=food.lastUpdated
      if (quantity.kind==="serving") {
        const serving=food.Serving.find(row=>row.id===quantity.servingId&&row.foodItemId===food.id)
        if (!serving||!positive(serving.servingWeightGram)||!positive(serving.defaultServingAmount))
          throw new Error("invalid_food_serving")
        servingId=serving.id;servingAmount=quantity.amount;loggedUnit=serving.servingName
        grams=quantity.amount*serving.servingWeightGram/serving.defaultServingAmount
      } else {
        grams=quantity.grams;servingAmount=grams;loggedUnit="g"
      }
      const computed=foodNutrition(food,grams)
      if (!computed) throw new Error("invalid_catalogue_nutrition")
      const factor=grams/(food.defaultServingWeightGram??0)
      nutrition={...computed,
        satFatG:food.satFatPerServing==null?null:food.satFatPerServing*factor,
        transFatG:food.transFatPerServing==null?null:food.transFatPerServing*factor,
        fiberG:food.fiberPerServing==null?null:food.fiberPerServing*factor,
        sugarG:food.sugarPerServing==null?null:food.sugarPerServing*factor,
        addedSugarG:food.addedSugarPerServing==null?null:food.addedSugarPerServing*factor}
    }
    if (!positive(grams)||grams>5000||!validNutrition(grams,nutrition)) throw new Error("invalid_meal_nutrition")
    if (proposed.groupId) {
      const old=groups.get(proposed.groupId)
      if (old!==undefined&&old!==proposed.groupLabel) throw new Error("conflicting_group_label")
      groups.set(proposed.groupId,proposed.groupLabel)
    }
    return {logicalItemId:randomUUID(),foodId,grams,servingId,servingAmount,loggedUnit,
      groupId:proposed.groupId,groupLabel:proposed.groupLabel,nutrition,evidence:proposed.evidence,
      origin:quantity.kind==="history"?"history":quantity.kind==="estimated_mass"?"estimate":"catalogue",
      ...(catalogueUpdatedAt?{catalogueUpdatedAt}:{}),
      ...(quantity.kind==="estimated_mass"?{assumption:quantity.basis}:{}),
      ...(sourceItemId?{sourceItemId}:{})}
  })
  for (const claim of proposal.claims) {
    if (!input.originalText.includes(claim.sourceText)||!claim.itemIndexes.length||
      claim.itemIndexes.some(index=>index>=items.length)) throw new Error("unsupported_nutrition_claim")
    const affected=claim.itemIndexes.map(index=>items[index])
    let actual:number|null=null
    if (claim.role==="label_identity") {
      if (affected.length!==1) throw new Error("invalid_label_scope")
      const food=evidence.foods.get(affected[0].foodId)
      if (!food) throw new Error("label_source_unavailable")
      const basis=claim.basis==="per_100g" ? foodNutrition(food,100) :
        claim.basis==="per_serving" ? foodNutrition(food,food.defaultServingWeightGram??0) : null
      actual=basis?.[claim.nutrient]??null
    } else {
      if (claim.basis!=="consumed"||claim.role==="portion_target"&&affected.length!==1)
        throw new Error("invalid_nutrition_scope")
      const values=affected.map(item=>item.nutrition[claim.nutrient])
      actual=values.every((value):value is number=>value!==null)?values.reduce((sum,value)=>sum+value,0):null
    }
    if (actual===null) throw new Error("nutrient_basis_unavailable")
    const tolerance=claim.relation==="approximate"?Math.max(1,claim.value*0.1):
      Math.max(claim.nutrient==="kcal"?0.5:0.05,claim.value*0.01)
    const compatible=claim.relation==="equal"||claim.relation==="approximate" ?
      Math.abs(actual-claim.value)<=tolerance : claim.relation==="minimum" ?
      actual+tolerance>=claim.value : actual-tolerance<=claim.value
    if (!compatible) throw new Error("nutrition_claim_conflicts_with_food")
  }
  return {schemaVersion:1,originalText:input.originalText,consumedOn:proposal.consumedOn,
    groups:[...groups].map(([id,label])=>({id,label})),items,claims:proposal.claims,
    model:{id:result.model,provider:result.provider},input:{operationId:input.operationId,
      submittedAt:input.submittedAt,timezone:input.timezone,locale:input.locale}}
}
