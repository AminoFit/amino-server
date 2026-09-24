// Opt-in paid model smoke. Reads shared FoodItem rows only. No hosted user/history
// reads, auth actions, imports, meal writes or personal data in the model prompt.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
if (!process.argv.includes('--live')) throw Error('Usage: node scripts/food-agent/smoke.cjs --live')
const root = path.resolve(__dirname,'../..')
Object.assign(process.env,require('dotenv').parse(fs.readFileSync(path.join(root,'.env.prod'))))
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}})
require('tsconfig-paths/register')
const {createClient} = require('@supabase/supabase-js')
const {resolveFoodAgent} = require('../../src/foodResolution/agent/resolve.ts')
const {createAgentEvidence} = require('../../src/foodResolution/agent/evidence.ts')
const {generateText} = require('ai')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}})
const catalogueOnly = {from(table){assert.equal(table,'FoodItem','Smoke must not read user data');return db.from(table)}}
const check = r=>{if(r.error)throw Error('Catalogue read failed');return r.data}
;(async()=>{
  const rice = check(await catalogueOnly.from('FoodItem').select('id,name,brand').eq('id',387).single())
  const cases = [
    {name:'explicit_mass',text:'100 g cooked white rice',expected:'matched',grams:100},
    {name:'unsupported_portion',text:'a large bowl of cooked white rice',expected:'unmatched'}
  ]
  const results=[]
  for (const c of cases) {
    const result = await resolveFoodAgent({user:{id:'synthetic-not-an-account',tzIdentifier:'UTC'},messageId:0,referenceTime:new Date().toISOString(),
      item:{food_database_search_name:'cooked white rice',full_item_user_message_including_serving:c.text,branded:false},candidates:[rice]},
      {evidence:(input,signal)=>({...createAgentEvidence(input,signal,catalogueOnly),
        searchUserFoodHistory:async()=>({disposition:'none',truncated:false,candidates:[]})}),
      generate:async options=>{try{return await generateText(options)}catch(e){console.log(JSON.stringify({providerError:e.name,status:e.statusCode}));throw e}}})
    const safe={case:c.name,...result};results.push(safe);console.log(JSON.stringify(safe))
    assert.equal(result.status,c.expected,c.name)
    if(c.grams){assert.equal(result.resolution.foodId,387);assert.equal(result.resolution.grams,c.grams);assert.ok(Math.abs(result.resolution.kcal-130)<.01)}
  }
  // Synthetic history demonstrates personal ranking without reading an account.
  // These illustrative foods exist only in this process, never in the catalogue.
  const powders = [101,102].map(id=>({id,name:'Whey protein powder',brand:id===101?'Alpha':'Beta',weightUnknown:false,
    defaultServingWeightGram:30,kcalPerServing:120,proteinPerServing:24,carbPerServing:3,totalFatPerServing:2,
    Serving:[{id:id+1000,foodItemId:id,servingName:'scoop',servingWeightGram:30,defaultServingAmount:1}]}))
  for (const explicitBrand of [undefined,'Alpha']) {
    const foods=new Map()
    const result=await resolveFoodAgent({user:{id:'synthetic-not-an-account',tzIdentifier:'UTC'},messageId:0,referenceTime:new Date().toISOString(),
      item:{food_database_search_name:'whey protein powder',full_item_user_message_including_serving:explicitBrand?'one scoop Alpha protein powder':'one scoop of protein powder',
        branded:!!explicitBrand,brand:explicitBrand},candidates:powders.map(({id,name,brand})=>({id,name,brand}))},
      {evidence:()=>({foods,searchFoodCandidates:async()=>powders.map(({id,name,brand})=>({id,name,brand})),
        getFoodAndServings:async id=>{const food=powders.find(f=>f.id===id);if(food)foods.set(id,food);return food??null},
        searchUserFoodHistory:async()=>({disposition:'ranked_foods',truncated:false,candidates:[{messageId:1,occurrenceDays:5,
          foods:[{foodId:102,name:'Whey protein powder',brand:'Beta',grams:30}]}]})})})
    const safe={case:explicitBrand?'synthetic_brand_override':'synthetic_personal_ranking',...result};results.push(safe);console.log(JSON.stringify(safe))
    assert.equal(result.status,'matched');assert.equal(result.resolution.foodId,explicitBrand?101:102)
    assert.equal(result.resolution.grams,30);assert.equal(result.resolution.kcal,120)
  }
  fs.writeFileSync('/tmp/amino-food-agent-smoke.json',JSON.stringify(results,null,2),{mode:0o600})
})().catch(()=>{console.error('Live smoke failed; see sanitized results above.');process.exitCode=1})
