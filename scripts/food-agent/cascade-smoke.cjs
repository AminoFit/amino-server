// Paid opt-in integration check using the actual Jev/Gemini shadow resolver.
// All model inputs/history are synthetic. --catalogue-read additionally verifies
// the batch adapter against shared FoodItem 387, without querying any user table.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(!process.argv.includes('--live'))throw Error('Usage: node scripts/food-agent/cascade-smoke.cjs --live [--catalogue-read]')
const root=path.resolve(__dirname,'../..'),env={...require('dotenv').parse(fs.readFileSync(path.join(root,'.env.prod'))),...process.env}
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {resolveFoodCascade}=require('../../src/foodResolution/agent/cascade.ts')
const {createAgentEvidence}=require('../../src/foodResolution/agent/evidence.ts')
function food(id,name,kcal,servings=[],extra={}){return {id,name,brand:null,defaultServingWeightGram:100,weightUnknown:false,
 kcalPerServing:kcal,proteinPerServing:null,carbPerServing:null,totalFatPerServing:null,
 Serving:servings.map(([unit,grams],i)=>({id:id*10+i,foodItemId:id,servingName:unit,servingWeightGram:grams,defaultServingAmount:1})),...extra}}
const couscous=food(301,'Couscous, cooked',112),dryCouscous=food(302,'Couscous, dry',376)
const soup=food(303,'Tomato soup',35),sauce=food(304,'Tomato sauce',70)
const chickpeas=food(305,'Chickpeas, cooked',164)
const kefir=food(306,'Plain kefir',60)
const alpha=food(307,'Smooth peanut butter',600,[['tbsp',16]],{brand:'Alpha'}),beta=food(308,'Smooth peanut butter',590,[['tbsp',17]],{brand:'Beta'})
const history={disposition:'ranked_foods',truncated:false,candidates:[{messageId:1,consumedOn:'2026-09-22T12:00:00Z',occurrenceDays:6,
 foods:[{foodId:308,name:beta.name,brand:beta.brand,grams:17}]}]}
const empty={disposition:'none',truncated:false,candidates:[]}
const cases=[
 {id:'cooked_couscous',text:'150 g cooked couscous',query:'cooked couscous',foods:[dryCouscous,couscous],expected:{foodId:301,grams:150,kcal:168}},
 {id:'soup_not_sauce',text:'200 g tomato soup',query:'tomato soup',foods:[sauce,soup],expected:{foodId:303,grams:200,kcal:70}},
 {id:'kefir_typo',text:'100 g plain kefire',query:'plain kefire',foods:[kefir],expected:{foodId:306,grams:100,kcal:60}},
 {id:'personal_peanut_butter',text:'one tbsp smooth peanut butter',query:'smooth peanut butter',foods:[alpha,beta],history,expected:{foodId:308,grams:17,kcal:100.3}},
 {id:'explicit_brand_override',text:'one tbsp Alpha smooth peanut butter',query:'smooth peanut butter',brand:'Alpha',foods:[alpha,beta],history,expected:{foodId:307,grams:16,kcal:96}},
 {id:'canonical_search_needed',text:'100 g cooked garbanzo beans',query:'cooked garbanzo beans',foods:[chickpeas],noSeeds:true,expected:{foodId:305,grams:100,kcal:164}},
 {id:'invalid_nutrition',text:'100 g plain kefir',query:'plain kefir',foods:[{...kefir,kcalPerServing:null}],status:'unmatched'},
 ...['chocolate protein bar with 25g of protein','250cals of kefire','700 cal Sweetgreen salad'].map((text,i)=>({id:'future_constraint_'+i,text,query:'food',foods:[kefir],status:'unsupported_input'}))
]
const caseIndex=process.argv.indexOf('--case'),repeatIndex=process.argv.indexOf('--repeat')
const selectedCases=caseIndex===-1?cases:cases.filter(c=>c.id===process.argv[caseIndex+1])
const repeats=repeatIndex===-1?1:Number(process.argv[repeatIndex+1])
if(!selectedCases.length||!Number.isInteger(repeats)||repeats<1||repeats>5)throw Error('Use a known --case and --repeat 1..5')
async function main(){
 const results=[],dir=path.join(__dirname,'results',new Date().toISOString().replace(/[:.]/g,'-')+'-cascade-smoke');fs.mkdirSync(dir,{recursive:true})
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify(selectedCases,null,2))
 if(process.argv.includes('--catalogue-read')){
  const {createClient}=require('@supabase/supabase-js'),db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const onlyCatalogue={from(table){assert.equal(table,'FoodItem');return db.from(table)}}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000)
  try {
   const e=createAgentEvidence({user:{id:'synthetic-not-an-account',tzIdentifier:'UTC'},messageId:0,referenceTime:'2026-09-23T12:00:00Z',
    item:{food_database_search_name:'cooked white rice',full_item_user_message_including_serving:'100 g rice',branded:false},candidates:[{id:387,name:'rice',brand:null}]},controller.signal,onlyCatalogue)
   const foods=await e.getFoodsAndServings([387,999999999]);assert.deepEqual(foods.map(f=>f.id),[387]);assert.ok(foods[0].Serving.length>0)
   console.log(JSON.stringify({catalogueBatchRead:'passed',foodId:387,servings:foods[0].Serving.length}))
  }finally{clearTimeout(timer)}
 }
 let failed=0
 for(const {c,trial} of Array.from({length:repeats},(_,i)=>selectedCases.map(c=>({c,trial:i+1}))).flat()){
  const cached=new Map(),discovered=new Set(c.noSeeds?[]:c.foods.map(f=>f.id));let catalogueSearches=0
  const hints=foods=>foods.map(({id,name,brand})=>({id,name,brand}))
  const input={user:{id:'synthetic-not-an-account',tzIdentifier:'UTC'},messageId:0,referenceTime:'2026-09-23T12:00:00Z',
   item:{food_database_search_name:c.query,full_item_user_message_including_serving:c.text,branded:!!c.brand,brand:c.brand},candidates:c.noSeeds?[]:hints(c.foods)}
  const result=await resolveFoodCascade(input,{env,fallbackEnabled:true,evidence:()=>({foods:cached,
   getFoodsAndServings:async ids=>{const foods=c.foods.filter(f=>ids.includes(f.id)&&discovered.has(f.id));foods.forEach(f=>cached.set(f.id,f));return foods},
   getFoodAndServings:async id=>{if(!discovered.has(id))return null;const f=c.foods.find(f=>f.id===id);if(f)cached.set(id,f);return f??null},
   searchFoodCandidates:async query=>{catalogueSearches++;const foods=c.noSeeds&&!/chickpea/i.test(query)?[]:c.foods;foods.forEach(f=>discovered.add(f.id));return hints(foods)},
   searchUserFoodHistory:async()=>{const h=c.history??empty;h.candidates.flatMap(r=>r.foods).forEach(f=>discovered.add(f.foodId));return h}
  })})
  const passed=c.expected?result.status==='matched'&&result.resolution.foodId===c.expected.foodId&&Math.abs(result.resolution.grams-c.expected.grams)<.01&&Math.abs(result.resolution.kcal-c.expected.kcal)<.02:result.status===c.status
  if(!passed)failed++
  const row={case:c.id,trial,passed,catalogueSearches,...result};results.push(row);fs.appendFileSync(path.join(dir,'results.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify(row))
 }
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({cases:results.length,passed:results.length-failed,failed,results},null,2))
 console.log(JSON.stringify({output:dir,passed:results.length-failed,failed}));if(failed)process.exitCode=1
}
main().catch(()=>{console.error('Integration smoke failed; no credentials or provider error bodies displayed.');process.exitCode=1})
