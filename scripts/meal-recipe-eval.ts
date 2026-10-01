// Live evaluation of recipe matching (plan phase 4): a user's own recipes are logged, in portions, when their words
// name them, and never because a generic word or another dish resembles them. Uses a fixture catalogue plus the user's
// own recipes and food, the real agent, Jev recipe check and compile; makes no database writes.
// EVAL_FAST_ROUTE=1 lets the text fast route race the agent (as in production).
// Run: npx ts-node -r tsconfig-paths/register scripts/meal-recipe-eval.ts [caseId...]  (EVAL_CONCURRENCY=2)
import { resolveMeal } from "@/mealResolution/resolve"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { foodSummary, type CatalogFood } from "@/mealResolution/evidence"

const USER="00000000-0000-4000-8000-000000000001"
const food=(id:number,name:string,kcal:number,protein:number,carb:number,fat:number,servings:[string,number,number?][]=[],
  extra:Partial<CatalogFood>={}):CatalogFood=>({
  id,name,brand:null,lastUpdated:"2026-09-01T00:00:00Z",defaultServingWeightGram:100,weightUnknown:false,
  kcalPerServing:kcal,proteinPerServing:protein,carbPerServing:carb,totalFatPerServing:fat,satFatPerServing:null,
  transFatPerServing:null,fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,
  Serving:servings.map(([servingName,grams,amount],i)=>({id:id*10+i,foodItemId:id,servingName,servingWeightGram:grams,defaultServingAmount:amount??1})),
  ...extra})
/** The user's recipe: values per portion, a "portion" serving. */
const recipe=(id:number,name:string,portions:number,portionGrams:number,kcal:number,protein:number,carb:number,fat:number)=>
  food(id,name,kcal,protein,carb,fat,[["portion",portionGrams]],{defaultServingWeightGram:portionGrams,privateToUserId:USER,recipePortions:portions})

const C={pastaCooked:1,chicken:2,chiliFlakes:3,chiliConCarne:4,egg:5,banana:6,oats:7,milk:8,shakeShared:9,bread:10,
  chickenPasta:101,turkeyChili:102,overnightOats:103,myShake:104}
const shared=[food(C.pastaCooked,"Pasta, cooked",158,5.8,31,0.9,[["cup",140]]),food(C.chicken,"Chicken breast, cooked",165,31,0,3.6),
  food(C.chiliFlakes,"Crushed red pepper flakes",318,12,57,17,[["tsp",1.8]]),
  food(C.chiliConCarne,"Chili con carne with beans",105,8,9,4.5,[["cup",250]]),food(C.egg,"Egg, fried",196,14,0.8,15,[["egg",46]]),
  food(C.banana,"Banana",89,1.1,23,0.3,[["medium banana",118]]),food(C.oats,"Oats, rolled, dry",379,13,68,6.5,[["cup",81]]),
  food(C.milk,"Milk, 2%",50,3.3,4.8,2,[["cup",244]]),food(C.shakeShared,"Protein shake, ready to drink",55,10,2,1,[["bottle",330]]),
  food(C.bread,"Garlic bread",350,8,42,16,[["slice",40]])]
const own=[recipe(C.chickenPasta,"Chicken pasta",12,250,420,32,45,11),recipe(C.turkeyChili,"Turkey chili",8,300,330,30,25,10),
  recipe(C.overnightOats,"Overnight oats",1,320,410,18,62,9),
  food(C.myShake,"Protein shake",160,30,6,2,[["bottle",330]],{defaultServingWeightGram:330,privateToUserId:USER,brand:"Homemade"})]
const all=[...shared,...own]
const byId=new Map(all.map(f=>[f.id,f]))
const words=(text:string)=>text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").split(/[^a-z]+/).filter(w=>w.length>=3)

type Case={id:string;text:string;expected:number[];grams?:Record<number,[number,number]>}
const cases:Case[]=[
  // Named recipes, in portions.
  {id:"portions",text:"1.5 portions of my chicken pasta",expected:[C.chickenPasta],grams:{[C.chickenPasta]:[370,380]}},
  {id:"half_portion",text:"half a portion of turkey chili",expected:[C.turkeyChili],grams:{[C.turkeyChili]:[145,155]}},
  {id:"bowl_of_named",text:"a bowl of chicken pasta",expected:[C.chickenPasta],grams:{[C.chickenPasta]:[245,255]}},
  {id:"mine_single",text:"my overnight oats",expected:[C.overnightOats],grams:{[C.overnightOats]:[315,325]}},
  {id:"recipe_plus_food",text:"1 portion of chicken pasta and a banana",expected:[C.chickenPasta,C.banana]},
  {id:"es_portions",text:"una porción y media de mi pasta con pollo",expected:[C.chickenPasta],grams:{[C.chickenPasta]:[370,380]}},
  // A shared word is not the recipe.
  {id:"restaurant_pasta",text:"a plate of pasta at Olive Garden",expected:[C.pastaCooked]},
  {id:"chili_flakes",text:"2 fried eggs with chili flakes",expected:[C.egg,C.chiliFlakes]},
  {id:"deli_chili",text:"a cup of chili con carne from the deli",expected:[C.chiliConCarne]},
  {id:"oats_with_milk",text:"a cup of oats with milk",expected:[C.oats,C.milk]},
  // The user's own (non-recipe) food is preferred, as before.
  {id:"own_food",text:"a bottle of my homemade protein shake",expected:[C.myShake]}
]

async function evaluate(item:Case) {
  const foods=new Map<number,CatalogFood>()
  const remember=(list:CatalogFood[])=>{for (const f of list) foods.set(f.id,f);return list}
  const evidence={foods,events:new Map(),discover(){},forget(){},
    async listMealEvents(){return {status:"ok",events:[],nextCursor:null}},
    async getMealEvent(){return {status:"unavailable"}},
    // Every food, those sharing a word with the query first (like the real search's ranking). Recipes are searchable
    // (recipes_in_agent on for this user).
    async searchFoods(query:string){remember(all)
      const q=words(query),score=(f:CatalogFood)=>q.filter(w=>f.name.toLowerCase().includes(w)).length
      const ranked=[...all].sort((a,b)=>score(b)-score(a)).slice(0,10)
      return {status:"ok",candidates:ranked.map(({id,name,brand})=>({id,name,brand,knownAs:[]})),foods:ranked.map(foodSummary),nextCursor:null}},
    async prefetchFoods(){return remember(shared)},
    // Like search_own_foods: the user's foods whose name is (mostly) in the text.
    async yourFoods(text:string){const t=words(text)
      return remember(own.filter(f=>{const n=words(f.name);return n.length>0&&n.filter(w=>t.includes(w)).length/n.length>=0.6}))},
    async recentFoods(){return own.map(({id,name,brand})=>({id,name,brand}))},
    async findFoodsByGtin(){return []},
    async getFoodsAndServings(ids:number[]){const found=remember(ids.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]))
      return {status:"ok",foods:found,missingIds:ids.filter(id=>!byId.has(id))}}}
  const noSources={sources:new Map(),async searchFoodSources(){return {status:"empty",candidates:[]}},
    proposeEstimatedFood(){throw new Error("not_available_in_eval")},proposeLabelFood(){throw new Error("not_available_in_eval")},
    async createFoodFromSource(){throw new Error("not_available_in_eval")}}
  const input={userId:USER,operationId:"00000000-0000-4000-8000-000000000002",messageId:1,originalText:item.text,
    consumedOn:"2026-09-30T12:00:00Z",submittedAt:"2026-09-30T12:00:00Z",timezone:"UTC",locale:null,attachmentIds:[]}
  const started=Date.now()
  const resolved=await resolveMeal(input,{evidence:evidence as any,sources:noSources as any,loadPhotos:async()=>[],deadlineMs:60000,
    fastRoute:process.env.EVAL_FAST_ROUTE==="1"})
  let plan:Awaited<ReturnType<typeof compileCheckedMealPlan>>|null=null,error:string|undefined
  // The production check, recipe check included (no photos, so no second look).
  try {plan=resolved.proposal.outcome==="resolved"?await compileCheckedMealPlan(input,resolved,{secondLook:false}):null}
  catch(e) {error=e instanceof Error?e.message:"invalid"}
  const ids=plan?.items.map(i=>i.foodId)??[]
  const gramsOk=Object.entries(item.grams??{}).every(([id,[low,high]])=>{
    const grams=plan?.items.filter(i=>i.foodId===Number(id)).reduce((sum,i)=>sum+i.grams,0)??0
    return grams>=low&&grams<=high})
  const pass=!error&&JSON.stringify(Array.from(new Set(ids)).sort((a,b)=>a-b))===JSON.stringify([...item.expected].sort((a,b)=>a-b))&&gramsOk
  return {id:item.id,pass,foodIds:ids,expected:item.expected,error,outcome:resolved.proposal.outcome,
    grams:plan?.items.map(i=>Math.round(i.grams)),units:plan?.items.map(i=>`${i.servingAmount} ${i.loggedUnit}`),
    steps:resolved.steps,ms:Date.now()-started,route:resolved.model,trace:resolved.trace?.slice(-3),
    clarification:resolved.proposal.clarification}
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
