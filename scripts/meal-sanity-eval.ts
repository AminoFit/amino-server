// Live Flash evaluation of meal matching sanity: every mentioned food exactly once,
// nothing invented or doubled, and the right energy-density variant, in several
// languages and with typos. Uses a fixture catalogue; makes no database writes.
// EVAL_PREFETCH=0 measures the search-only path.
// Run: npx ts-node -r tsconfig-paths/register scripts/meal-sanity-eval.ts [caseId...]  (EVAL_CONCURRENCY=2)
import { compileMealPlan } from "@/mealResolution/compile"
import { resolveMeal } from "@/mealResolution/resolve"
import { foodSummary, type CatalogFood } from "@/mealResolution/evidence"

const food=(id:number,name:string,kcal:number,protein:number,carb:number,fat:number,servings:[string,number][]=[]):CatalogFood=>({
  id,name,brand:null,lastUpdated:"2026-09-01T00:00:00Z",defaultServingWeightGram:100,weightUnknown:false,
  kcalPerServing:kcal,proteinPerServing:protein,carbPerServing:carb,totalFatPerServing:fat,satFatPerServing:null,
  transFatPerServing:null,fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,
  Serving:servings.map(([servingName,grams],i)=>({id:id*10+i,foodItemId:id,servingName,servingWeightGram:grams,defaultServingAmount:1}))})
const C={chicken:1,oil:2,riceCooked:3,riceDry:4,egg:5,bread:6,butter:7,coffee:8,milk:9,oatMilk:10,banana:11,
  yogurt:12,honey:13,walnuts:14,pastaDry:15,pastaCooked:16,tunaOil:17,tunaWater:18,lettuce:19,ranch:20}
const catalogue=[food(C.chicken,"Chicken breast, cooked",165,31,0,3.6),food(C.oil,"Olive oil",884,0,0,100,[["tbsp",13.5]]),
  food(C.riceCooked,"White rice, cooked",130,2.7,28,0.3,[["cup",158]]),food(C.riceDry,"White rice, dry (uncooked)",360,6.6,79,0.6),
  food(C.egg,"Egg, boiled",155,13,1.1,11,[["egg",50]]),food(C.bread,"Toast, white bread",265,9,49,3.2,[["slice",30]]),
  food(C.butter,"Butter",717,0.9,0.1,81,[["tsp",5]]),food(C.coffee,"Coffee, brewed",2,0.3,0,0,[["cup",240]]),
  food(C.milk,"Milk, 2%",50,3.3,4.8,2,[["cup",244]]),food(C.oatMilk,"Oat milk",46,1,6.7,1.5,[["cup",240]]),
  food(C.banana,"Banana",89,1.1,23,0.3,[["medium banana",118]]),food(C.yogurt,"Greek yogurt, plain",97,9,3.9,5,[["cup",200]]),
  food(C.honey,"Honey",304,0.3,82,0,[["tbsp",21]]),food(C.walnuts,"Walnuts",654,15,14,65,[["oz",28]]),
  food(C.pastaDry,"Pasta, dry",371,13,75,1.5),food(C.pastaCooked,"Pasta, cooked",158,5.8,31,0.9),
  food(C.tunaOil,"Tuna, canned in oil, drained",198,29,0,8.2),food(C.tunaWater,"Tuna, canned in water, drained",116,26,0,0.8),
  food(C.lettuce,"Lettuce, romaine",17,1.2,3.3,0.3,[["cup",47]]),food(C.ranch,"Ranch dressing",430,1,6,45,[["tbsp",15]])]
const byId=new Map(catalogue.map(f=>[f.id,f]))

const cases:{id:string;text:string;expected:number[]}[]=[
  {id:"en_meal",text:"200 g chicken breast with 1 tbsp olive oil and 150 g rice",expected:[C.chicken,C.oil,C.riceCooked]},
  {id:"es_meal",text:"200 g de pechuga de pollo con una cucharada de aceite de oliva y 150 g de arroz cocido",expected:[C.chicken,C.oil,C.riceCooked]},
  {id:"typo_meal",text:"200g chiken brest w/ 1 tbsp olive oyl + 150g cookd rice",expected:[C.chicken,C.oil,C.riceCooked]},
  {id:"eggs_toast",text:"2 boiled eggs and a slice of toast with butter",expected:[C.egg,C.bread,C.butter]},
  {id:"ja_eggs",text:"ゆで卵2個とトースト1枚",expected:[C.egg,C.bread]},
  {id:"de_oat_coffee",text:"Eine Tasse Kaffee mit Hafermilch",expected:[C.coffee,C.oatMilk]},
  {id:"fr_coffee_milk",text:"un café avec du lait demi-écrémé",expected:[C.coffee,C.milk]},
  {id:"banana_only",text:"a banana",expected:[C.banana]},
  {id:"omission",text:"Greek yogurt with honey and walnuts, no granola",expected:[C.yogurt,C.honey,C.walnuts]},
  {id:"dry_rice",text:"80 g uncooked rice",expected:[C.riceDry]},
  {id:"cooked_rice_boiled",text:"a cup of boiled rice",expected:[C.riceCooked]},
  {id:"dry_pasta",text:"100g pasta (dry weight)",expected:[C.pastaDry]},
  {id:"pt_cooked_pasta",text:"200 g de macarrão cozido",expected:[C.pastaCooked]},
  {id:"tuna_oil",text:"a can of tuna in olive oil, 120 g drained",expected:[C.tunaOil]},
  {id:"tuna_water",text:"atún al natural 120 g",expected:[C.tunaWater]},
  {id:"salad",text:"romaine salad with grilled chicken and ranch",expected:[C.lettuce,C.chicken,C.ranch]}
]

async function evaluate(item:typeof cases[number]) {
  const foods=new Map<number,CatalogFood>()
  const evidence={foods,events:new Map(),discover(){},
    async listMealEvents(){return {status:"ok",events:[],nextCursor:null}},
    async getMealEvent(){return {status:"unavailable"}},
    async searchFoods(){for (const f of catalogue) foods.set(f.id,f)
      return {status:"ok",candidates:catalogue.map(({id,name,brand})=>({id,name,brand,knownAs:[]})),foods:catalogue.map(foodSummary),nextCursor:null}},
    async prefetchFoods(){if (process.env.EVAL_PREFETCH==="0") return [];for (const f of catalogue) foods.set(f.id,f);return catalogue},
    async getFoodsAndServings(ids:number[]){const found=ids.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
      for (const f of found) foods.set(f.id,f);return {status:"ok",foods:found,missingIds:ids.filter(id=>!byId.has(id))}}}
  const noSources={sources:new Map(),async searchFoodSources(){return {status:"empty",candidates:[]}},
    proposeEstimatedFood(){throw new Error("not_available_in_eval")},proposeLabelFood(){throw new Error("not_available_in_eval")},async createFoodFromSource(){throw new Error("not_available_in_eval")}}
  const input={userId:"00000000-0000-4000-8000-000000000001",operationId:"00000000-0000-4000-8000-000000000002",
    messageId:1,originalText:item.text,consumedOn:"2026-09-25T12:00:00Z",submittedAt:"2026-09-25T12:00:00Z",
    timezone:"UTC",locale:null,attachmentIds:[]}
  const started=Date.now()
  const resolved=await resolveMeal(input,{evidence:evidence as any,sources:noSources as any,loadPhotos:async()=>[],deadlineMs:45000})
  let plan,error:string|undefined
  try {plan=resolved.proposal.outcome==="resolved"?compileMealPlan(input,resolved):null} catch(e) {error=e instanceof Error?e.message:"invalid"}
  const ids=plan?.items.map(i=>i.foodId)??[]
  const pass=!error&&JSON.stringify([...ids].sort((a,b)=>a-b))===JSON.stringify([...item.expected].sort((a,b)=>a-b))
  return {id:item.id,pass,foodIds:ids,expected:item.expected,error,outcome:resolved.proposal.outcome,
    grams:plan?.items.map(i=>Math.round(i.grams)),kcal:plan?Math.round(plan.items.reduce((s,i)=>s+i.nutrition.kcal,0)):null,
    steps:resolved.steps,ms:Date.now()-started,clarification:resolved.proposal.clarification}
}

async function main() {
  const only=process.argv.slice(2),concurrency=Number(process.env.EVAL_CONCURRENCY??2)
  const results:Record<string,any>[]=[],queue=cases.filter(c=>!only.length||only.includes(c.id))
  await Promise.all(Array.from({length:concurrency},async()=>{
    for (let item=queue.shift();item;item=queue.shift()) {
      try {results.push(await evaluate(item))} catch(e) {results.push({id:item.id,pass:false,error:e instanceof Error?e.message:"unknown"})}
    }
  }))
  results.sort((a,b)=>cases.findIndex(c=>c.id===a.id)-cases.findIndex(c=>c.id===b.id))
  for (const r of results) console.log(JSON.stringify(r))
  const passed=results.filter(r=>r.pass).length
  console.log(`\n${passed}/${results.length} passed`)
  if (passed<results.length) process.exitCode=1
}
void main()
