const {test}=require('node:test'),assert=require('node:assert/strict')
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {tryFoodAgentLive}=require('../src/foodResolution/agent/live.ts')
const {foodTrace}=require('../src/foodResolution/telemetry.ts'),{foodConfig}=require('../src/foodResolution/config.ts')
const food={id:1,name:'Peanut butter',brand:null,defaultServingWeightGram:100,weightUnknown:false,kcalPerServing:600,
 proteinPerServing:null,carbPerServing:null,totalFatPerServing:null,Nutrient:[],Serving:[{id:2,foodItemId:1,servingName:'tbsp',servingWeightGram:32,defaultServingAmount:2}]}
const input={user:{id:'synthetic',tzIdentifier:'UTC'},messageId:1,referenceTime:'2026-09-23T12:00:00Z',candidates:[{id:1,name:food.name,brand:null}],
 item:{food_database_search_name:'peanut butter',full_item_user_message_including_serving:'100 g peanut butter',branded:false}}
const result={status:'matched',strategy:'jev_gemini',route:'jev',durationMs:1,steps:1,toolCalls:2,toolErrors:0,promptTokens:1,completionTokens:1,model:'jev',provider:'mock',
 resolution:{foodId:1,servingId:null,grams:100,kcal:600,proteinG:null,carbG:null,totalFatG:null}}
async function configured(work,changes={}){
 const settings={FOOD_FAST_SELECTOR:'on',FOOD_FAST_SELECTOR_PERCENT:'100',FOOD_AGENT_FALLBACK:'on',FOOD_AGENT_FALLBACK_PERCENT:'100',FOOD_BASELINE_TELEMETRY:'false',FOOD_KILL_SWITCH:'false',...changes}
 const old=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings)
 try{return await foodTrace('synthetic',1,'text',work)}finally{for(const k of Object.keys(settings)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
}
test('live admission requires explicit on and honors global rollback',async()=>{
 for(const mode of ['off','shadow'])assert.equal(await configured(()=>tryFoodAgentLive(input,{run:()=>assert.fail('Not live')}),{FOOD_FAST_SELECTOR:mode}),null)
 assert.equal(await configured(()=>tryFoodAgentLive(input,{run:()=>assert.fail('Kill switch')}),{FOOD_KILL_SWITCH:'true'}),null)
 const config=foodConfig('synthetic',{FOOD_FAST_SELECTOR:'on',FOOD_FAST_SELECTOR_PERCENT:'100',FOOD_AGENT_FALLBACK:'shadow',FOOD_AGENT_FALLBACK_PERCENT:'100'})
 assert.equal(config.features.agent_fallback,'off')
})
test('live result revalidates authoritative catalogue data and keeps grams/kilograms representation',async()=>{
 const out=await configured(()=>tryFoodAgentLive({...input,item:{...input.item,full_item_user_message_including_serving:'0.1 kg peanut butter'}},
 {run:async(_,opts)=>{assert.equal(opts.fallbackEnabled,true);return result},read:async(id,signal)=>{assert.equal(id,1);assert.ok(!signal.aborted);return food}}))
 assert.equal(out.food.id,1);assert.equal(out.serving.serving_name,'kg');assert.equal(out.serving.serving_amount,.1);assert.equal(out.serving.total_serving_g_or_ml,100)
})
test('household serving amount comes from the stored default amount, not a model weight',async()=>{
 const out=await configured(()=>tryFoodAgentLive({...input,item:{...input.item,full_item_user_message_including_serving:'one tbsp peanut butter'}},
 {run:async()=>({...result,resolution:{...result.resolution,servingId:2,grams:16,kcal:96}}),read:async()=>food}))
 assert.equal(out.serving.serving_amount,1);assert.equal(out.serving.serving_id,2);assert.equal(out.serving.total_serving_g_or_ml,16)
})
test('changed, missing or invalid catalogue data returns to baseline instead of saving stale nutrition',async()=>{
 for(const changed of [null,{...food,kcalPerServing:700},{...food,kcalPerServing:null},{...food,weightUnknown:true}]){
  assert.equal(await configured(()=>tryFoodAgentLive(input,{run:async()=>result,read:async()=>changed})),null)
 }
 assert.equal(await configured(()=>tryFoodAgentLive(input,{run:async()=>({...result,resolution:{...result.resolution,foodId:99}}),read:async()=>food})),null)
})
test('unresolved, unavailable and thrown model/read failures return to baseline without writes',async()=>{
 for(const status of ['unmatched','deadline','unavailable','unsupported_input','invalid_proposal'])
  assert.equal(await configured(()=>tryFoodAgentLive(input,{run:async()=>({...result,status,resolution:undefined}),read:()=>assert.fail('No lookup')})),null)
 assert.equal(await configured(()=>tryFoodAgentLive(input,{run:async()=>{throw Error('provider')}})),null)
 assert.equal(await configured(()=>tryFoodAgentLive(input,{run:async()=>result,read:async()=>{throw Error('read')}})),null)
})
test('live cohort never also starts a shadow model, even if legacy shadow mode is on',async()=>{
 const {startFoodAgentShadow}=require('../src/foodResolution/agent/shadow.ts')
 assert.equal(await configured(()=>startFoodAgentShadow(input,()=>assert.fail('Duplicate model work')),{FOOD_AGENT_TEXT:'shadow',FOOD_AGENT_TEXT_PERCENT:'100'}),null)
})
