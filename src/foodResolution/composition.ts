import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

// Explicit energy-bearing additions need their own coverage. This is a narrow
// deterministic backstop, not a recipe parser or an ingredient estimator.
const additions=[
  ["oil",/\b(?:oils?|ghee)\b/i], ["butter",/\bbutter\b/i],
  ["dressing",/\b(?:dressings?|vinaigrette)\b/i], ["sauce",/\b(?:sauces?|gravy|pesto)\b/i],
  ["mayonnaise",/\b(?:mayonnaise|mayo)\b/i], ["cheese",/\bcheese\b/i],
  ["cream",/\bcream\b/i], ["milk",/\bmilk\b/i], ["syrup",/\bsyrup\b/i],
  ["honey",/\bhoney\b/i], ["sugar",/\bsugar\b/i], ["bacon",/\bbacon\b/i],
  ["avocado",/\bavocado\b/i], ["nuts",/\b(?:nuts?|almonds?|walnuts?|peanuts?|pecans?)\b/i]
] as const
const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const mealBase=(s:string)=>/\b(?:chicken|beef|steak|fish|salmon|rice|noodles?|pasta|salad|toast|pancakes?|waffles?|oatmeal|coffee|tea|yogurt|bread)\b/i.test(s)
const parts=(text:string)=>{
  const match=/\s+(?:(?:topped|served|dressed)\s+with|with|woth|w\/|and)\s+/i.exec(text)
  if(!match)return null
  const base=text.slice(0,match.index).trim(),addition=text.slice(match.index+match[0].length).trim()
  // Negated additions must not turn into new food entries.
  if(!base||!addition||/^(?:no|without)\b/i.test(addition))return null
  const required=additions.filter(([,pattern])=>pattern.test(addition)).map(([name])=>name)
  return required.length ? {base,addition,required} : null
}
const evidenceFor=(name:string)=>{
  // A vinaigrette is an oil dressing; an explicitly fat-free one is not oil evidence.
  const text=/\bvinaigrette\b/i.test(name)&&!/\b(?:fat[- ]free|no oil|oil[- ]free)\b/i.test(name) ? `${name} oil dressing` : name
  return new Set(additions.filter(([,pattern])=>pattern.test(text)).map(([key])=>key))
}
export function missingExplicitAdditions(item: FoodItemToLog, foodName: string): string[] {
  const required=new Set([...(parts(item.full_item_user_message_including_serving ?? "")?.required ?? []),
    ...(parts(item.food_database_search_name ?? "")?.required ?? [])])
  const supplied=evidenceFor(foodName)
  return [...required].filter(key=>!supplied.has(key))
}
function searchName(text:string) {
  return text.replace(/^(?:(?:one|two|three|a|an|\d+(?:\.\d+)?)\s*(?:tbsp|tsp|tablespoons?|teaspoons?|g|grams?|ml|cups?)\s+(?:of\s+)?)/i,"")
    .replace(/\s+on the side\b/i,"").trim()
}
export function preserveExplicitAdditions(items: FoodItemToLog[]): FoodItemToLog[] {
  const out:FoodItemToLog[]=[]
  for(const item of items) {
    const split=parts(item.full_item_user_message_including_serving ?? "")
    // Safely decompose common unbranded meal components. Packaged/composite
    // products and nutrition totals require semantic/group resolution instead.
    if(!split || item.brand?.trim() || item.branded || item.upc ||
      !mealBase(split.base) || mealBase(split.addition) ||
      Object.values(item.nutritional_information ?? {}).some(v=>v!=null) ||
      /\b\d+(?:\.\d+)?\s*(?:k?cals?|calories?|g\s*(?:of\s+)?(?:protein|fat|carbs?))\b/i.test(item.full_item_user_message_including_serving) ||
      /[,;]\s*(?:approximately|about|around)?\s*\d/i.test(split.addition)) {out.push(item);continue}
    const splitName=parts(item.food_database_search_name)
    // A recipe/product name that already includes the addition cannot safely be
    // reinterpreted as a plain base plus another portion of that ingredient.
    if(!splitName && split.required.some(key=>evidenceFor(item.food_database_search_name).has(key))) {out.push(item);continue}
    const other=items.filter(candidate=>candidate!==item && !mealBase(parts(candidate.full_item_user_message_including_serving ?? "")?.base ?? "") &&
      split.required.every(key=>evidenceFor(candidate.food_database_search_name).has(key)))
    const sameAdditionParents=items.filter(candidate=>normal(parts(candidate.full_item_user_message_including_serving ?? "")?.addition ?? "")===normal(split.addition))
    // Multiple portions or multiple possible side entries cannot be reconciled by
    // name alone. Keep the compound item for the mandatory coverage guard.
    if(other.length>1 || (other.length===1 && (sameAdditionParents.length>1 || normal(searchName(split.addition))!==normal(other[0].food_database_search_name)))) {out.push(item);continue}
    const source=item.full_item_user_message_including_serving
    const {serving:_,...base}=item
    out.push({...base,food_database_search_name:splitName?.base ?? item.food_database_search_name,
      full_item_user_message_including_serving:split.base,
      componentOrigin:{sourceText:source,role:"base",portionSpecified:/\d|\b(?:one|two|half|whole)\b/i.test(split.base)}})
    if(other.length===0) out.push({food_database_search_name:searchName(split.addition),full_item_user_message_including_serving:split.addition,
      branded:false,timeEaten:item.timeEaten,componentOrigin:{sourceText:source,role:"addition",portionSpecified:/\d|\b(?:one|two|half)\b/i.test(split.addition)}})
  }
  return out
}
