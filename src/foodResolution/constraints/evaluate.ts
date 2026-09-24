import { foodNutrition } from "../nutrition"
import type { EvidenceFood } from "../agent/types"
import { identityTolerance, type NutritionClaim } from "./contract"

const agrees=(actual:number,claim:NutritionClaim,tolerance=.01)=>claim.relation==="min" ? actual+tolerance>=claim.value :
  claim.relation==="max" ? actual-tolerance<=claim.value : Math.abs(actual-claim.value)<=
    (claim.relation==="approx"?Math.max(tolerance,claim.value*.05):tolerance)

export function derivePortion(food:EvidenceFood,claim:NutritionClaim,explicitGrams?:number) {
  if(claim.purpose!=="portion"||claim.basis!=="consumed"||!["eq","approx"].includes(claim.relation))return {status:"unsupported" as const}
  const basis=foodNutrition(food,100),amount=basis?.[claim.nutrient]
  if(typeof amount!=="number"||!Number.isFinite(amount)||amount<=0||!Number.isFinite(claim.value)||claim.value<=0)return {status:"missing_basis" as const}
  const grams=explicitGrams ?? claim.value/amount*100,nutrition=foodNutrition(food,grams)
  if(!nutrition)return {status:"invalid_nutrition" as const}
  const actual=nutrition[claim.nutrient]
  if(actual===null||!agrees(actual,claim))return {status:"conflict" as const}
  return {status:"resolved" as const,grams,nutrition,provenance:{source:"calculated_from_user_target" as const,nutrient:claim.nutrient,value:claim.value,approximate:claim.relation==="approx"}}
}

export function checkProductIdentity(food:EvidenceFood,claim:NutritionClaim,servingId:number|null) {
  if(claim.purpose!=="identity"||claim.basis==="consumed")return {status:"unsupported" as const}
  let grams=100
  if(claim.basis==="per_serving"){
    const serving=food.Serving.find(s=>s.id===servingId&&s.foodItemId===food.id)
    const unit=claim.servingUnit?.toLowerCase().replace(/s$/,"")
    const label=serving?.servingName.toLowerCase().trim().match(/^(?:(\d+(?:\.\d+)?)\s+)?([a-z ]+)$/)
    if(!serving || !label || !unit || label[2].replace(/s$/,"")!==unit || !serving.servingWeightGram || !serving.defaultServingAmount ||
      (label[1]&&Number(label[1])!==serving.defaultServingAmount))return {status:"missing_basis" as const}
    grams=serving.servingWeightGram/serving.defaultServingAmount
  }
  const nutrition=foodNutrition(food,grams),actual=nutrition?.[claim.nutrient]
  if(typeof actual!=="number")return {status:"missing_basis" as const}
  return {status:agrees(actual,claim,identityTolerance(claim))?"matches" as const:"conflict" as const,actual,grams}
}

export type MealComponent={itemIndex:number;kcal:number|null;parentItemIndex?:number}
export function reconcileMealTotal(claim:NutritionClaim,components:MealComponent[]) {
  if(claim.purpose!=="meal_total"||claim.nutrient!=="kcal"||claim.basis!=="consumed")return {status:"unsupported" as const}
  if(!Number.isFinite(claim.value)||claim.value<=0||!claim.itemIndexes.length||new Set(claim.itemIndexes).size!==claim.itemIndexes.length)return {status:"invalid_group" as const}
  const members=components.filter(c=>claim.itemIndexes.includes(c.itemIndex))
  if(new Set(members.map(c=>c.itemIndex)).size!==members.length || members.some(c=>c.parentItemIndex!==undefined&&claim.itemIndexes.includes(c.parentItemIndex)))
    return {status:"invalid_group" as const}
  if(members.length!==claim.itemIndexes.length||members.some(c=>typeof c.kcal!=="number"||!Number.isFinite(c.kcal)||c.kcal<0))
    return {status:"unresolved" as const} // No fabricated ingredients or calorie-only database row.
  const targetCents=Math.round(claim.value*100),sumCents=members.reduce((n,c)=>n+Math.round(c.kcal!*100),0)
  const differenceCents=targetCents-sumCents
  if(claim.relation!=="eq")return {status:agrees(sumCents/100,claim)?"matches" as const:"conflict" as const,totalKcal:sumCents/100,differenceKcal:differenceCents/100}
  // Permit only the residual caused by independently rounding the source values.
  const exactRounded=Math.round(members.reduce((n,c)=>n+c.kcal!,0)*100)
  if(exactRounded!==targetCents || Math.abs(differenceCents)>Math.ceil(members.length/2))return {status:"conflict" as const,totalKcal:sumCents/100,differenceKcal:differenceCents/100}
  const adjusted=members.map(c=>({...c,kcal:Math.round(c.kcal!*100)/100})).sort((a,b)=>b.kcal-a.kcal||a.itemIndex-b.itemIndex)
  for(let i=0;i<Math.abs(differenceCents);i++) adjusted[i%adjusted.length].kcal+=Math.sign(differenceCents)/100
  return {status:"matches" as const,totalKcal:targetCents/100,roundingAdjustmentKcal:differenceCents/100,components:adjusted}
}
