import { compileMealPlan } from "@/mealResolution/compile"
import { resolveMeal } from "@/mealResolution/resolve"
import type { MealEvent } from "@/mealResolution/evidence"

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
  const results=[]
  for(const item of cases) {
    try {results.push(await evaluate(item.locale,item.text,item.source,item.expected))}
    catch(error) {results.push({locale:item.locale,error:error instanceof Error?error.message:"unknown"})}
  }
  console.log(JSON.stringify(results,null,2))
  if(results.some(result=>!("correct" in result)||!result.correct)) process.exitCode=1
}
void main()
