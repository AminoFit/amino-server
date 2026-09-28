import { compileMealPlan } from "@/mealResolution/compile"
import { resolveMeal } from "@/mealResolution/resolve"
import type { MealEvent } from "@/mealResolution/evidence"
import { localTime } from "@/mealOperations/instant"

const components=[
  {id:11,foodItemId:101,name:"Plain yogurt",groupId:"smoothie"},
  {id:12,foodItemId:102,name:"Banana",groupId:"smoothie"},
  {id:13,foodItemId:103,name:"Protein powder",groupId:"smoothie"},
  {id:14,foodItemId:104,name:"Chia seeds",groupId:"smoothie"},
  {id:15,foodItemId:105,name:"Boiled egg",groupId:"side"}
]
const event:MealEvent={messageId:42,revision:1,originalText:"Smoothie with yogurt, banana, protein powder and chia seeds; boiled egg on the side",
  consumedOn:"2026-09-23T12:00:00Z",hasimages:false,
  foods:components.map(row=>({...row,updatedAt:"2026-09-23T12:10:00Z",brand:null,
    grams:100,kcal:100,nutrition:{kcal:100,proteinG:5,carbG:10,totalFatG:2,
      fiberG:2,vitaminCMg:4},servingId:null,servingAmount:null,loggedUnit:"g"})),
  groups:[{id:"smoothie",label:"Smoothie"},{id:"side",label:"Side dish"}]}
const soupEvent:MealEvent={messageId:42,revision:1,
  originalText:"Lentil soup with lentils, carrots and broth; bread on the side",
  consumedOn:event.consumedOn,hasimages:false,
  foods:[
    {id:21,foodItemId:201,name:"Lentils",groupId:"soup"},
    {id:22,foodItemId:202,name:"Carrots",groupId:"soup"},
    {id:23,foodItemId:203,name:"Vegetable broth",groupId:"soup"},
    {id:24,foodItemId:204,name:"Bread",groupId:"side"}
  ].map(row=>({...row,updatedAt:"2026-09-23T12:10:00Z",brand:null,
    grams:100,kcal:100,nutrition:{kcal:100,proteinG:5,carbG:10,totalFatG:2,
      fiberG:2,vitaminCMg:4},servingId:null,servingAmount:null,loggedUnit:"g"})),
  groups:[{id:"soup",label:"Soup"},{id:"side",label:"Side dish"}]}
const legacyEvent:MealEvent={...event,revision:0,groups:[],
  foods:event.foods.map(food=>({...food,groupId:null}))}
// Travel cases: the user's local day differs from the UTC day, so a UTC reading picks the wrong meal or time.
// --travel runs only these.
const smoothieTwoDaysAgo:MealEvent={...event,messageId:41,originalText:"Green smoothie with spinach and apple",
  consumedOn:"2026-09-23T00:00:00Z",foods:[{...event.foods[0],id:31,foodItemId:301,name:"Spinach",groupId:"smoothie"},
    {...event.foods[1],id:32,foodItemId:302,name:"Apple",groupId:"smoothie"}]}
const tokyoYesterday:MealEvent={...event,consumedOn:"2026-09-24T00:00:00Z"} // 09:00 on the 24th in Tokyo
const tomatoSoupLastEvening:MealEvent={...soupEvent,messageId:41,originalText:"Tomato soup with bread",
  consumedOn:"2026-09-24T01:00:00Z", // 18:00 on the 23rd in Los Angeles
  foods:[{...soupEvent.foods[0],id:41,foodItemId:401,name:"Tomato soup",groupId:"soup"},
    {...soupEvent.foods[3],id:44,foodItemId:404,name:"Bread",groupId:"side"}]}
const lentilSoupThisMorning:MealEvent={...soupEvent,consumedOn:"2026-09-24T16:00:00Z"} // 09:00 on the 24th in Los Angeles
type TravelCase={locale:string;text:string;events:MealEvent[];expected:number[];timezone:string;submittedAt:string;
  consumedWithin?:[string,string]}
const travelCases:TravelCase[]=[
  // 08:30 on the 25th in Tokyo is 23:30 on the 24th in UTC: "yesterday" is the 24th locally, the 23rd in UTC.
  {locale:"en-US",text:"Same smoothie as yesterday",events:[smoothieTwoDaysAgo,tokyoYesterday],expected:[101,102,103,104],
    timezone:"Asia/Tokyo",submittedAt:"2026-09-24T23:30:00Z"},
  // 22:30 on the 24th in Los Angeles is 05:30 on the 25th in UTC: "this morning" is the 24th locally.
  // "Same soup" is the soup group without its bread side, as in the cases below.
  {locale:"en-US",text:"Same soup as I had this morning",events:[tomatoSoupLastEvening,lentilSoupThisMorning],expected:[201,202,203],
    timezone:"America/Los_Angeles",submittedAt:"2026-09-25T05:30:00Z"},
  // 14:00 on the 25th in Tokyo: breakfast this morning is roughly 06:00-11:00 JST (21:00-02:00 UTC).
  {locale:"en-US",text:"Same smoothie as yesterday, I had it for breakfast this morning",events:[smoothieTwoDaysAgo,tokyoYesterday],
    expected:[101,102,103,104],timezone:"Asia/Tokyo",submittedAt:"2026-09-25T05:00:00Z",
    consumedWithin:["2026-09-24T21:00:00Z","2026-09-25T02:00:00Z"]}
]

async function evaluateTravel(item:TravelCase) {
  const events=new Map<number,MealEvent>()
  // As in production: UTC plus the user's own clock.
  const withLocal=(meal:MealEvent)=>({...meal,consumedOnLocal:localTime(meal.consumedOn,item.timezone)})
  const evidence={events,foods:new Map(),
    async listMealEvents(){return {status:"ok",events:item.events.map(meal=>{const local=withLocal(meal)
      return {messageId:meal.messageId,originalText:meal.originalText,consumedOn:local.consumedOn,
        consumedOnLocal:local.consumedOnLocal,foodCount:meal.foods.length,revision:meal.revision}}),nextCursor:null}},
    async getMealEvent(id:number){const meal=item.events.find(candidate=>candidate.messageId===id)
      if(!meal) return {status:"unavailable"};events.set(id,meal);return {status:"ok",event:withLocal(meal)}},
    async searchFoods(){return {status:"empty",candidates:[],nextCursor:null}},
    async getFoodsAndServings(){return {status:"ok",foods:[],missingIds:[]}}
  }
  const input={userId:"00000000-0000-4000-8000-000000000001",operationId:"00000000-0000-4000-8000-000000000002",
    messageId:43,originalText:item.text,consumedOn:item.submittedAt,submittedAt:item.submittedAt,timezone:item.timezone,
    locale:item.locale,attachmentIds:[]}
  const resolved=await resolveMeal(input,{evidence:evidence as any,deadlineMs:90000})
  const plan=resolved.proposal.outcome==="resolved"?compileMealPlan(input,resolved):null
  const ids=plan?.items.map(item=>item.foodId)??[]
  const consumed=Date.parse(plan?.consumedOn??"")
  const timeOk=item.consumedWithin?consumed>=Date.parse(item.consumedWithin[0])&&consumed<=Date.parse(item.consumedWithin[1]):
    consumed===Date.parse(item.submittedAt)
  return {locale:`${item.timezone} ${item.text}`,correct:JSON.stringify(ids.slice().sort())===JSON.stringify(item.expected)&&timeOk,
    outcome:resolved.proposal.outcome,foodIds:ids,consumedOn:plan?.consumedOn,steps:resolved.steps,
    clarification:resolved.proposal.clarification}
}

const cases=[
  {locale:"en-US",text:"Same smoothie as yesterday",source:event,expected:[101,102,103,104]},
  {locale:"es-ES",text:"El mismo batido de ayer",source:event,expected:[101,102,103,104]},
  {locale:"zh-CN",text:"和昨天一样的奶昔",source:event,expected:[101,102,103,104]},
  {locale:"ar-SA",text:"نفس السموذي الذي شربته أمس",source:event,expected:[101,102,103,104]},
  {locale:"fr-FR",text:"Le même smoothie qu'hier, sans graines de chia",source:event,expected:[101,102,103]},
  {locale:"pt-BR",text:"O mesmo smoothie de ontem, sem chia",source:event,expected:[101,102,103]},
  {locale:"de-DE",text:"Die gleiche Linsensuppe wie gestern",source:soupEvent,expected:[201,202,203]},
  {locale:"ja-JP",text:"昨日と同じレンズ豆のスープ",source:soupEvent,expected:[201,202,203]},
  {locale:"en-US",text:"Same smoothie as yesterday",source:legacyEvent,expected:[101,102,103,104]},
  {locale:"es-ES",text:"El mismo batido de ayer",source:legacyEvent,expected:[101,102,103,104]},
  {locale:"zh-CN",text:"和昨天一样的奶昔",source:legacyEvent,expected:[101,102,103,104]},
  {locale:"ar-SA",text:"نفس السموذي الذي شربته أمس",source:legacyEvent,expected:[101,102,103,104]}
]

async function evaluate(locale:string,originalText:string,source:MealEvent,expected:number[]) {
  const events=new Map<number,MealEvent>()
  let historyReads=0
  const evidence={events,foods:new Map(),
    async listMealEvents(){return {status:"ok",events:[{messageId:42,
      originalText:source.originalText,consumedOn:source.consumedOn,foodCount:source.foods.length,revision:source.revision}],nextCursor:null}},
    async getMealEvent(id:number){historyReads++;if(id===42){events.set(42,source);return {status:"ok",event:source}}
      return {status:"unavailable"}},
    async searchFoods(){return {status:"empty",candidates:[],nextCursor:null}},
    async getFoodsAndServings(){return {status:"ok",foods:[],missingIds:[]}}
  }
  const input={userId:"00000000-0000-4000-8000-000000000001",operationId:"00000000-0000-4000-8000-000000000002",
    messageId:43,originalText,consumedOn:"2026-09-24T12:00:00Z",
    submittedAt:"2026-09-24T12:00:00Z",timezone:"America/New_York",locale,attachmentIds:[]}
  const resolved=await resolveMeal(input,{evidence:evidence as any,deadlineMs:90000})
  const plan=resolved.proposal.outcome==="resolved"?compileMealPlan(input,resolved):null
  const ids=plan?.items.map(item=>item.foodId)??[]
  const correct=JSON.stringify(ids.slice().sort())===JSON.stringify(expected)&&
    Date.parse(plan?.consumedOn??"")===Date.parse("2026-09-24T12:00:00Z")
  return {locale,correct,outcome:resolved.proposal.outcome,foodIds:ids,
    historyReads,steps:resolved.steps,toolCalls:resolved.toolCalls,durationMs:Math.round(resolved.durationMs),
    clarification:resolved.proposal.clarification}
}

async function main() {
  const results:any[]=[]
  const only=process.argv.includes("--travel")
  for(const item of travelCases) {
    try {results.push(await evaluateTravel(item))}
    catch(error) {results.push({locale:item.timezone,error:error instanceof Error?error.message:"unknown"})}
  }
  for(const item of only?[]:cases) {
    try {results.push(await evaluate(item.locale,item.text,item.source,item.expected))}
    catch(error) {results.push({locale:item.locale,error:error instanceof Error?error.message:"unknown"})}
  }
  console.log(JSON.stringify(results,null,2))
  if(results.some(result=>!("correct" in result)||!result.correct)) process.exitCode=1
}
void main()
