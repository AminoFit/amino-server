import { z } from "zod"

export const nutritionPlanSchema=z.object({claims:z.array(z.object({
  id:z.string().min(1).max(32),sourceText:z.string().min(1).max(500),
  nutrient:z.enum(["kcal","proteinG","carbG","totalFatG"]),value:z.number().positive().finite(),
  purpose:z.enum(["identity","portion","meal_total"]),relation:z.enum(["eq","approx","min","max"]),
  basis:z.enum(["consumed","per_serving","per_100g"]),servingUnit:z.string().max(30).nullable(),
  itemIndexes:z.array(z.number().int().nonnegative()).min(1).max(20)
}).strict()).max(30)}).strict()
export type NutritionPlan=z.infer<typeof nutritionPlanSchema>
export type NutritionClaim=NutritionPlan["claims"][number]
const patterns={kcal:/(\d+(?:\.\d+)?)\s*(?:k?cals?|calories?)\b/ig,
  proteinG:/(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s+)?protein\b(?!\s+(?:powder|bars?|shakes?)\b)/ig,
  carbG:/(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s+)?carb(?:ohydrate)?s?\b/ig,
  totalFatG:/(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s+)?fat\b(?![- ]free)/ig}
export function hasNutritionStatement(text:string):boolean {
  return Object.values(patterns).some(p=>new RegExp(p.source,p.flags).test(text))
}
function sourceValue(claim:NutritionClaim) {
  return [...claim.sourceText.matchAll(new RegExp(patterns[claim.nutrient].source,patterns[claim.nutrient].flags))]
    .find(match=>Number(match[1])===claim.value)
}
export function identityTolerance(claim:NutritionClaim):number {
  const literal=sourceValue(claim)?.[1]
  return literal ? .5*10**(-(literal.split(".")[1]?.length ?? 0)) : 0
}
export function validateNutritionPlan(value:unknown, text:string, itemCount:number):NutritionPlan|null {
  const parsed=nutritionPlanSchema.safeParse(value)
  if(!parsed.success || !Number.isSafeInteger(itemCount) || itemCount<1 || itemCount>20)return null
  const ids=new Set<string>(),signatures=new Set<string>(),grouped=new Set<number>()
  for(const claim of parsed.data.claims){
    if(!text.includes(claim.sourceText)||text.indexOf(claim.sourceText)!==text.lastIndexOf(claim.sourceText)||ids.has(claim.id)||claim.value>(claim.nutrient==="kcal"?45000:5000)||
      new Set(claim.itemIndexes).size!==claim.itemIndexes.length||claim.itemIndexes.some(i=>i>=itemCount))return null
    ids.add(claim.id)
    const match=sourceValue(claim)
    if(!match)return null // The model may classify a fact, never invent its numeric value.
    // Inspect the original context too: a cropped quote cannot remove “about”,
    // a minus sign, a range, or the label's per-100-g basis.
    const offset=text.indexOf(claim.sourceText)+match.index!
    const before=text.slice(0,offset).trimEnd()
    if(/[\d.,+−–-]$/.test(before))return null
    const relation=/\b(?:at least|minimum(?: of)?)\s*$/i.test(before)?"min":/\b(?:at most|maximum(?: of)?|no more than)\s*$/i.test(before)?"max":
      /(?:\b(?:about|approximately|approx\.?|around|roughly)|[~≈])\s*$/i.test(before)?"approx":"eq"
    if(claim.relation!==relation)return null
    const after=text.slice(offset+match[0].length)
    const per100=/\bper\s*100\s*g\b|\/\s*100\s*g\b/i.test(claim.sourceText)||
      /^\s*(?:per\s*100\s*g\b|\/\s*100\s*g\b)/i.test(after)
    if(per100!==(claim.basis==="per_100g") || (per100&&claim.servingUnit!==null))return null
    if(claim.purpose==="identity"){
      if(claim.basis==="consumed"||claim.itemIndexes.length!==1)return null
      if(claim.basis==="per_serving" && (!claim.servingUnit || !/^[a-z ]+$/i.test(claim.servingUnit) ||
        !claim.sourceText.toLowerCase().includes(claim.servingUnit.toLowerCase())))return null
    }else if(claim.basis!=="consumed" || claim.servingUnit!==null || (claim.purpose==="portion"&&claim.itemIndexes.length!==1))return null
    if(claim.purpose==="meal_total"){
      if(claim.nutrient!=="kcal"||claim.itemIndexes.some(i=>grouped.has(i)))return null
      claim.itemIndexes.forEach(i=>grouped.add(i))
    }
    const signature=JSON.stringify([claim.sourceText,claim.nutrient,claim.purpose,claim.basis,[...claim.itemIndexes].sort()])
    if(signatures.has(signature))return null
    signatures.add(signature)
  }
  // Every stated number must survive interpretation, not only the first fact.
  for(const [nutrient,pattern] of Object.entries(patterns)) for(const match of text.matchAll(new RegExp(pattern.source,pattern.flags))){
    if(!parsed.data.claims.some(c=>c.nutrient===nutrient&&c.value===Number(match[1])&&
      text.indexOf(c.sourceText)<=match.index!&&text.indexOf(c.sourceText)+c.sourceText.length>=match.index!+match[0].length))return null
  }
  if(hasNutritionStatement(text)&&parsed.data.claims.length===0)return null
  return parsed.data
}
