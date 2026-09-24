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
const containsPhrase=(text:string,phrase:string)=>` ${normal(text)} `.includes(` ${normal(phrase)} `)
const mealBase=(s:string)=>/\b(?:chicken|beef|steak|fish|salmon|rice|noodles?|pasta|salad|toast|pancakes?|waffles?|oatmeal|coffee|espresso|tea|yogurt|bread)\b/i.test(s)
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
// Milk percentage is product identity, not a serving amount or nutrient target.
// A shortened search name must not erase a variant retained in the description.
export function matchesExplicitMilkVariant(item:FoodItemToLog, foodName:string):boolean {
  const requested=`${item.food_database_search_name} ${item.full_item_user_message_including_serving ?? ""}`
  if(!/\bmilk\b/i.test(requested)||/\b(?:bars?|shakes?|smoothies?|lattes?|cappuccinos?|mochas?|powder|yogurt|cheese|ice cream|coffee|espresso|tea)\b/i.test(requested))return true
  const variants=(text:string)=>{
    const values=new Set([...text.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)].map(m=>String(Number(m[1]))))
    if(/\b(?:fat[- ]free|non[- ]?fat|skim(?:med)?)\b/i.test(text))values.add("0")
    if(/\bwhole\s+(?:(?:ultra[- ]filtered|organic|lactose[- ]free)\s+)*milk\b/i.test(text))values.add("whole")
    return values
  }
  const required=variants(requested)
  if(!required.size)return true
  const supplied=variants(foodName)
  return required.size===1&&supplied.size===1&&[...required][0]===[...supplied][0]
}
function searchName(text:string) {
  return text.replace(/^(?:(?:one|two|three|a|an|\d+(?:\.\d+)?)\s*(?:tbsp|tsp|tablespoons?|teaspoons?|g|grams?|ml|cups?)\s+(?:of\s+)?)/i,"")
    .replace(/\s+(?:(?:one|two|three|a|an|\d+(?:\.\d+)?)\s+)?(?:cups?|tbsp|tsp|tablespoons?|teaspoons?)$/i,"")
    .replace(/\s+on the side\b/i,"").trim()
}
function additionIdentity(item:FoodItemToLog) {
  const name=searchName(item.food_database_search_name)
  return normal(item.brand?.trim()&&!containsPhrase(name,item.brand) ? `${item.brand} ${name}` : name)
}
export function preserveExplicitAdditions(items: FoodItemToLog[]): FoodItemToLog[] {
  const out:FoodItemToLog[]=[]
  for(const item of items) {
    const split=parts(item.full_item_user_message_including_serving ?? "")
    // A brand that occurs only in the addition belongs to that component, not
    // the whole meal (coffee + branded milk, toast + branded butter, etc.).
    const additionBrand=split && item.brand?.trim() && containsPhrase(split.addition,item.brand) &&
      !containsPhrase(split.base,item.brand) ? item.brand.trim() : undefined
    // Packaged/composite products and nutrition totals still require semantic
    // resolution. Brand location alone is not evidence to split a bottled drink.
    if(!split || ((item.brand?.trim() || item.branded) && !additionBrand) || item.upc ||
      /\b(?:bottled|canned|packaged|pre[- ]?mixed|ready[- ]to[- ]drink|latte|cappuccino|mocha|frappuccino|shake|smoothie|bar)\b/i.test(split.base) ||
      !mealBase(split.base) || mealBase(split.addition) ||
      Object.values(item.nutritional_information ?? {}).some(v=>v!=null) ||
      /\b\d+(?:\.\d+)?\s*(?:k?cals?|calories?|g\s*(?:of\s+)?(?:protein|fat|carbs?))\b/i.test(item.full_item_user_message_including_serving) ||
      /[,;]\s*(?:approximately|about|around)?\s*\d/i.test(split.addition)) {out.push(item);continue}
    const splitName=parts(item.food_database_search_name)
    // A recipe/product name that already includes the addition cannot safely be
    // reinterpreted as a plain base plus another portion of that ingredient.
    if(!splitName && !additionBrand && split.required.some(key=>evidenceFor(item.food_database_search_name).has(key))) {out.push(item);continue}
    // Keep quantities with the component they describe, including postfix
    // wording such as "Fairlife milk cup". Search terms omit portion units.
    const addition=split.addition
    const other=items.filter(candidate=>candidate!==item && !mealBase(parts(candidate.full_item_user_message_including_serving ?? "")?.base ?? "") &&
      split.required.every(key=>evidenceFor(candidate.food_database_search_name).has(key)))
    const sameAdditionParents=items.filter(candidate=>normal(parts(candidate.full_item_user_message_including_serving ?? "")?.addition ?? "")===normal(split.addition))
    // Multiple portions or multiple possible side entries cannot be reconciled by
    // name alone. Keep the compound item for the mandatory coverage guard.
    if(other.length>1 || (other.length===1 && (sameAdditionParents.length>1 || normal(searchName(addition))!==additionIdentity(other[0])))) {out.push(item);continue}
    const source=item.full_item_user_message_including_serving
    const {serving:_,...base}=item
    out.push({...base,food_database_search_name:splitName?.base ?? (additionBrand ? searchName(split.base) : item.food_database_search_name),
      ...(additionBrand ? {branded:false,brand:""} : {}),
      full_item_user_message_including_serving:split.base,
      componentOrigin:{sourceText:source,role:"base",portionSpecified:/\d|\b(?:one|two|half|whole)\b/i.test(split.base)}})
    if(other.length===0) out.push({food_database_search_name:searchName(addition),full_item_user_message_including_serving:addition,
      branded:!!additionBrand,...(additionBrand ? {brand:additionBrand} : {}),timeEaten:item.timeEaten,
      componentOrigin:{sourceText:source,role:"addition",portionSpecified:/\d|\b(?:one|two|half|cups?|tbsp|tsp|tablespoons?|teaspoons?)\b/i.test(addition)}})
  }
  return out
}
