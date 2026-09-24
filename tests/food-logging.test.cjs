const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, stubs = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in stubs) return stubs[name]
    if (name === '@/foodResolution/nutrition') return load('foodResolution/nutrition.ts')
    if (name === '@/foodResolution/composition') return load('foodResolution/composition.ts')
    if (name === '@/foodResolution/constraints/shadow') return {shadowNutritionConstraints:async()=>{}}
    if (name === '@/foodResolution/agent/shadow') return {startFoodAgentShadow:()=>Promise.resolve(null),finishFoodAgentShadow:async()=>{}}
    if (name === '@/foodResolution/agent/live') return {tryFoodAgentLive:async()=>null}
    if (name === '@/foodResolution/history/reuse') return {reuseFoodHistory:async()=>null,isHistoryReference:()=>false}
    if (name === '@/foodResolution/history/shadow') return {shadowFoodHistory:async()=>{}}
    if (name === '@/foodResolution/telemetry') return { foodTrace: (u,m,c,fn)=>fn(), foodStage:(s,fn)=>fn(), foodMetric(){}, setFoodInputClass(){}, currentFoodConfig:()=>undefined }
    // Unused legacy imports have no live side effects in this isolated harness.
    return {}
  }, console: { log(){}, error(){}, warn(){} }, Date, process: {env: {}}, Response, Request, ...globals })
  return module.exports
}
function memoryDb(message, foods = []) {
  const state = { message: { id: 1, status: 'PROCESSING', resolvedAt: null, itemsProcessed: 0, itemsToProcess: 1, deletedAt: null, ...message }, foods }
  const db = { from(table) {
    const filters = []; let update
    const q = { select(){return q}, update(data){update=data;return q}, eq(k,v){filters.push([k,v]);return q}, is(k,v){filters.push([k,v]);return q},
      single(){return run(true)}, maybeSingle(){return run(true)}, then(y,n){return run(false).then(y,n)} }
    async function run(single) {
      if (table === 'LoggedFoodItem') return { data: state.foods, error: null }
      if (!filters.every(([k,v]) => state.message[k] === v)) return {data: null, error:null}
      if (update) Object.assign(state.message, update)
      return {data: {...state.message}, error:null}
    }
    return q
  }}
  return { state, db, admin: { createAdminSupabase: () => db } }
}
const { explicitMassServing } = load('foodMessageProcessing/getServingSizeFromFoodItem/explicitMassServing.ts')
const { calculateNutrientData } = load('foodMessageProcessing/common/calculateNutrientData.ts')
test('100 g cooked white rice resolves to 100 grams and 130 kcal without a model', () => {
  const serving = explicitMassServing('100 g cooked white rice')
  assert.equal(serving.total_serving_g_or_ml, 100)
  assert.equal(serving.serving_name, 'g')
  const nutrients = calculateNutrientData(100, {defaultServingWeightGram:158, kcalPerServing:205.4, Nutrient:[]})
  assert.equal(nutrients.kcal, 130)
  assert.equal(explicitMassServing('0.5 kg cooked white rice').total_serving_g_or_ml, 500)
})
test('ambiguous quantities and volume do not use the mass shortcut', () => {
  for (const text of ['100-200 g rice','2 x 100 g rice','100 g rice 2 servings','100 g per bag rice','100 ml rice','0 g rice']) {
    assert.equal(explicitMassServing(text), null, text)
  }
})
test('explicit grams bypass the serving provider entirely', async () => {
  const api = load('foodMessageProcessing/getServingSizeFromFoodItem/getServingSizeFromFoodItem.ts', {
    './explicitMassServing': {explicitMassServing},
    '@/foodResolution/model': {foodCompletion(){throw Error('must not call model')}}
  })
  const result = await api.findBestServingMatchChatGemini({full_item_user_message_including_serving:'100 g cooked white rice'}, {}, {})
  assert.equal(result.serving.total_serving_g_or_ml, 100)
})
test('message updates honor zero resets and do not resolve empty/failed requests', async () => {
  const {state,admin} = memoryDb({itemsProcessed:3,itemsToProcess:5})
  const {default:update} = load('database/UpdateMessage.ts', {'@/utils/supabase/serverAdmin':admin})
  await update({id:1,itemsProcessed:0,itemsToProcess:0,status:'PROCESSING'})
  assert.equal(state.message.itemsProcessed,0); assert.equal(state.message.itemsToProcess,0)
  assert.equal(state.message.status,'PROCESSING')
  await update({id:1,status:'FAILED'})
  assert.equal(state.message.status,'FAILED')
})
test('concurrent counter updates cannot overwrite each other', async () => {
  const {state,admin} = memoryDb({itemsToProcess:5})
  const {default:update} = load('database/UpdateMessage.ts', {'@/utils/supabase/serverAdmin':admin})
  await Promise.all([update({id:1,incrementItemsProcessedBy:1}),update({id:1,incrementItemsProcessedBy:1})])
  assert.equal(state.message.itemsProcessed,2)
})
for (const [statuses,expected,count] of [
  [['Processed','Processed'],'RESOLVED',2],
  [['Processed','Needs Processing'],'PROCESSING',1],
  [['Processed','Matching Failed'],'FAILED',1],
  [['Matching Failed'],'FAILED',0],
  [[], 'PROCESSING',0]
]) test(`progress reports ${statuses.join('/')} as ${expected}`, async () => {
  const {admin} = memoryDb({itemsToProcess: statuses.length || 1},statuses.map(status=>({status})))
  const {refreshFoodMessageProgress} = load('foodMessageProcessing/common/refreshFoodMessageProgress.ts', {'@/utils/supabase/serverAdmin':admin})
  const result = await refreshFoodMessageProgress(1)
  assert.equal(result.status,expected); assert.equal(result.itemsProcessed,count)
})
function quickLogHarness({ timeFails=false, foodStatus='Processed', owner='user', extractionFails=false, reuseReply=null,extracted,expectedCount=1 }={}) {
  const mem = memoryDb({status:'RECEIVED',userId:owner,content:'100 g cooked white rice',itemsToProcess:0})
  const update = load('database/UpdateMessage.ts',{'@/utils/supabase/serverAdmin':mem.admin}).default
  const refresh = load('foodMessageProcessing/common/refreshFoodMessageProgress.ts',{'@/utils/supabase/serverAdmin':mem.admin}).refreshFoodMessageProgress
  let queued=0;const queuedFoods=[]
  const api=load('foodMessageProcessing/RespondToMessage.ts', {
    '@/database/GetMessagesForUser':{GetMessageById:async()=>({...mem.state.message})},
    '@/database/UpdateMessage':{default:update},
    '@/foodResolution/history/reuse':{reuseFoodHistory:async()=>reuseReply,isHistoryReference:()=>true},
    './common/claimFoodMessage':load('foodMessageProcessing/common/claimFoodMessage.ts',{'@/utils/supabase/serverAdmin':mem.admin}),
    './common/refreshFoodMessageProgress':{refreshFoodMessageProgress:refresh},
    './messageTime/extractMessageTime':{getMessageTimeChat:async()=>{if(timeFails)throw Error('provider unavailable');return null}},
    '@/foodMessageProcessing/logFoodItemExtract/logFoodItemStreamChat':{logFoodItemStream:async()=>{
      if(extractionFails)throw Error('stream unavailable')
      return {foodItemsToLog:extracted??[{food_database_search_name:'cooked white rice'}],isBadFoodLogRequest:false}
    }},
    './addLogFoodItemToQueue':{AddLoggedFoodItemToQueue:async(_user,_message,food,index)=>{
      assert.equal(mem.state.message.itemsToProcess,expectedCount,'final expected count is published before dispatch')
      queued++;queuedFoods.push(food);mem.state.foods.push({status:typeof foodStatus==='function'?foodStatus(food,index):foodStatus});await refresh(1);return {loggedFoodItemId:10,index:0}
    }}
  })
  return { ...mem, run:()=>api.GenerateResponseForQuickLog({id:'user'},1,'2026-09-23T12:00:00Z'), queued:()=>queued,queuedFoods }
}
test('time-provider rejection still allows the meal to be logged successfully', async()=>{
  const h=quickLogHarness({timeFails:true}); const result=await h.run()
  assert.equal(result.status,'RESOLVED');assert.equal(result.itemsProcessed,1);assert.match(result.warning,/time/)
})
test('failed rice match is not returned as successful logging',async()=>{
  const h=quickLogHarness({foodStatus:'Matching Failed'});const result=await h.run()
  assert.equal(result.status,'FAILED');assert.equal(result.itemsProcessed,0);assert.doesNotMatch(result.resultMessage,/successfully/)
})
test('foreign messages are rejected without mutation or queue work',async()=>{
  const h=quickLogHarness({owner:'someone-else'});await assert.rejects(h.run(),/unavailable/)
  assert.equal(h.state.message.status,'RECEIVED');assert.equal(h.queued(),0)
})
test('extraction failure does not leave a partially submitted meal',async()=>{
  const h=quickLogHarness({extractionFails:true,timeFails:true});await assert.rejects(h.run(),/stream/)
  assert.equal(h.state.message.status,'FAILED');assert.equal(h.queued(),0)
})
for(const [body,status] of [['{',400],[JSON.stringify({messageId:1,consumedOn:'bad'}),400],[JSON.stringify({messageId:1}),500]]) {
 test(`API returns JSON for error ${status}: ${body}`,async()=>{
  const api=load('app/api/protected/user/process-message-quick-log/route.ts',{
    'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
    '@/utils/supabase/GetUserFromRequest':{GetAminoUserOnRequest:async()=>({aminoUser:{id:'user',subscriptionExpiryDate:'2099-01-01'}})},
    '@/foodMessageProcessing/RespondToMessage':{GenerateResponseForQuickLog:async()=>{throw Error('post-commit error')}}
  })
  const result=await api.POST(new Request('https://example.test',{method:'POST',body}))
  assert.equal(result.status,status);assert.match(result.headers.get('content-type'),/json/);assert.ok((await result.json()).error)
 })
}

test('Gemini 3.8 request uses low thinking and usage logging cannot spoil a response',async()=>{
  let sent
  const api=load('languageModelProviders/gemini/foodCompletion.ts',{
    '../openai/utils/openAiHelper':{LogOpenAiUsage:async()=>{throw Error('usage db down')}}
  },{process:{env:{GEMINI_API_KEY:'fake',FOOD_REASONING_MODEL:'gemini-3.8-flash'}},AbortSignal,fetch:async(url,options)=>{
    sent={url,...JSON.parse(options.body)}
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"grams":100}'}]}}],usageMetadata:{totalTokenCount:10}})
  }})
  const result=await api.foodCompletion({systemPrompt:'food',userMessage:'100g rice'}, {})
  assert.equal(JSON.parse(result).grams,100)
  assert.match(sent.url,/gemini-3.8-flash/)
  assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel,'low')
  assert.equal(sent.generationConfig.thinkingConfig.thinkingBudget,undefined)
})
test('truncated Gemini JSON is rejected instead of being logged as a valid serving',async()=>{
  const api=load('languageModelProviders/gemini/foodCompletion.ts',{},
    {process:{env:{GEMINI_API_KEY:'fake',FOOD_REASONING_MODEL:'gemini-3.8-flash'}},AbortSignal,fetch:async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"grams":'}]}}]})})
  await assert.rejects(api.foodCompletion({systemPrompt:'food',userMessage:'rice'},{}),/finish/)
})
test('exact match requires an unambiguous name and brand',async()=>{
  let rows=[{id:387,name:'cooked white rice',brand:'',defaultServingWeightGram:158,kcalPerServing:205.4}]
  const q={select(){return q},ilike(key,value){assert.equal(value,'cooked white rice');return q},limit:async()=>({data:rows,error:null})}
  const {findExactLocalFood}=load('foodMessageProcessing/findExactLocalFood.ts',{'@/utils/supabase/serverAdmin':{createAdminSupabase:()=>({from:()=>q})}})
  const food={food_database_search_name:'cooked white rice',branded:false,brand:''}
  assert.equal((await findExactLocalFood(food)).id,387)
  assert.equal(await findExactLocalFood({...food,branded:true,brand:'Acme'}),null)
  rows=[...rows,{...rows[0],id:388}]
  assert.equal(await findExactLocalFood(food),null)
})
test('rice worker uses exact food and grams without embeddings; icon failure preserves success',async()=>{
  const {findBestServingMatchChatGemini}=load('foodMessageProcessing/getServingSizeFromFoodItem/getServingSizeFromFoodItem.ts',{'./explicitMassServing':{explicitMassServing}})
  let saved,refreshed=0
  const api=load('foodMessageProcessing/processAndMatchLoggedFoodItem.ts',{
    './findExactLocalFood':{findExactLocalFood:async()=>({id:387,name:'cooked white rice',brand:'',defaultServingWeightGram:158,kcalPerServing:205.4,Nutrient:[]})},
    '@/database/GetMessagesForUser':{GetMessageById:async()=>({id:1,content:'100 g cooked white rice'})},
    './getServingSizeFromFoodItem/getServingSizeFromFoodItem':{findBestServingMatchChatGemini},
    './common/calculateNutrientData':{calculateNutrientData},
    './common/updateLoggedFoodItemData':{updateLoggedFoodItemWithData:async(id,data)=>{saved=data;return data}},
    './common/refreshFoodMessageProgress':{refreshFoodMessageProgress:async()=>{refreshed++}},
    './foodIconsProcess':{LinkIconsOrCreateIfNeeded:async()=>{throw Error('icon service down')}}
  })
  await api.ProcessLogFoodItem({id:10},{food_database_search_name:'cooked white rice',full_item_user_message_including_serving:'100 g cooked white rice'},1,{id:'user'})
  assert.equal(saved.status,'Processed');assert.equal(saved.kcal,130);assert.equal(saved.grams,100);assert.equal(refreshed,1)
})
test('meal is marked complete before slow icon decoration finishes', async () => {
  let releaseIcon, iconStarted = false, refreshed = false, saved;
  const icon = new Promise(resolve => { releaseIcon = resolve });
  const api = load('foodMessageProcessing/processAndMatchLoggedFoodItem.ts', {
    './findExactLocalFood': { findExactLocalFood: async () => ({ id: 387, name: 'rice', defaultServingWeightGram: 100, kcalPerServing: 130, Nutrient: [] }) },
    '@/database/GetMessagesForUser': { GetMessageById: async () => ({ id: 1, content: '100 g rice' }) },
    './getServingSizeFromFoodItem/getServingSizeFromFoodItem': { findBestServingMatchChatGemini: async item => ({ ...item, serving: explicitMassServing('100 g rice') }) },
    './common/calculateNutrientData': { calculateNutrientData },
    './common/updateLoggedFoodItemData': { updateLoggedFoodItemWithData: async (_id, data) => (saved = data) },
    './common/refreshFoodMessageProgress': { refreshFoodMessageProgress: async () => { assert.equal(saved.status, 'Processed'); refreshed = true } },
    './foodIconsProcess': { LinkIconsOrCreateIfNeeded: async () => { iconStarted = true; assert.equal(refreshed, true); await icon } }
  });
  const work = api.ProcessLogFoodItem({ id: 10 }, { food_database_search_name: 'rice', full_item_user_message_including_serving: '100 g rice' }, 1, { id: 'user' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(iconStarted, true); assert.equal(refreshed, true);
  releaseIcon(); await work;
})
test('enqueue inserts immediately using database timestamp defaults, without a clock RPC', async () => {
  let inserted, queued;
  const q = { insert(value) { inserted = value; return q }, select() { return q }, single: async () => ({ data: { id: 10 }, error: null }) };
  const api = load('foodMessageProcessing/addLogFoodItemToQueue.ts', {
    '@/utils/supabase/serverAdmin': { createAdminSupabase: () => ({ from: () => q, rpc() { throw Error('extra round trip') } }) },
    '@/utils/helper/convertFoodItemToLog': { convertNutritionalInfoStrings: value => value },
    '@/app/api/queues/process-food-item/process-food-item': { processFoodItemQueue: { enqueue: async id => { queued = id } } }
  });
  await api.AddLoggedFoodItemToQueue({ id: 'user' }, { id: 1 }, { timeEaten: '2026-09-23T12:00:00Z' }, 0);
  assert.equal(inserted.status, 'Needs Processing'); assert.equal(inserted.createdAt, undefined); assert.equal(inserted.updatedAt, undefined); assert.equal(queued, '10');
})
test('Gemini access denial falls back once to the working OpenAI provider',async()=>{
  const urls=[]
  const api=load('languageModelProviders/gemini/foodCompletion.ts',{}, {
    process:{env:{GEMINI_API_KEY:'fake',OPENAI_API_KEY:'fake',FOOD_REASONING_MODEL:'gemini-3.8-flash'}},AbortSignal,
    fetch:async(url)=>{
      urls.push(url)
      return urls.length===1 ? new Response('',{status:403}) : Response.json({choices:[{finish_reason:'stop',message:{content:'{"grams":100}'}}]})
    }
  })
  assert.equal(JSON.parse(await api.foodCompletion({systemPrompt:'food',userMessage:'rice'},{})).grams,100)
  assert.equal(urls.length,2);assert.match(urls[1],/api.openai.com/)
})
test('OpenRouter accepts the configured key alias and routes Gemini with JSON and low reasoning',async()=>{
  let request
  const api=load('languageModelProviders/gemini/foodCompletion.ts',{}, {
    process:{env:{OPEN_ROUTER_API_KEY:'router-test',FOOD_REASONING_MODEL:'google/gemini-3.8-flash'}},AbortSignal,
    fetch:async(url,options)=>{
      request={url,...options,body:JSON.parse(options.body)}
      return Response.json({choices:[{finish_reason:'stop',message:{content:'{"grams":100}'}}]})
    }
  })
  assert.equal(JSON.parse(await api.foodCompletion({systemPrompt:'food',userMessage:'rice'},{})).grams,100)
  assert.equal(request.url,'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(request.headers.Authorization,'Bearer router-test')
  assert.equal(request.body.model,'google/gemini-3.8-flash')
  assert.equal(request.body.reasoning.effort,'low')
  assert.equal(request.body.response_format.type,'json_object')
})
test('OpenRouter insufficient credits falls back without forwarding the router key',async()=>{
  const requests=[]
  const api=load('languageModelProviders/gemini/foodCompletion.ts',{}, {
    process:{env:{OPENROUTER_API_KEY:'router-test',OPENAI_API_KEY:'openai-test',FOOD_REASONING_MODEL:'google/gemini-3.8-flash'}},AbortSignal,
    fetch:async(url,options)=>{
      requests.push({url,auth:options.headers.Authorization})
      return requests.length===1 ? new Response('',{status:402}) : Response.json({choices:[{finish_reason:'stop',message:{content:'{"grams":100}'}}]})
    }
  })
  await api.foodCompletion({systemPrompt:'food',userMessage:'rice'}, {})
  assert.equal(requests.length,2)
  assert.equal(requests[0].auth,'Bearer router-test')
  assert.equal(requests[1].auth,'Bearer openai-test')
  assert.match(requests[1].url,/api.openai.com/)
})

test('simultaneous initial submissions enqueue a meal only once', async()=>{
  const h=quickLogHarness(); await Promise.all([h.run(),h.run()]); assert.equal(h.queued(),1)
  await h.run(); assert.equal(h.queued(),1)
})

for (const owner of ['user','other']) test(`post-commit response recovery respects owner ${owner}`,async()=>{
  const api=load('app/api/protected/user/process-message-quick-log/route.ts',{
    'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
    '@/utils/supabase/GetUserFromRequest':{GetAminoUserOnRequest:async()=>({aminoUser:{id:'user',subscriptionExpiryDate:'2099-01-01'}})},
    '@/foodMessageProcessing/RespondToMessage':{GenerateResponseForQuickLog:async()=>{throw Error('response failed')}},
    '@/database/GetMessagesForUser':{GetMessageById:async()=>({userId:owner,status:'RESOLVED',itemsToProcess:2,itemsProcessed:2})}
  })
  const response=await api.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({messageId:1})}))
  assert.equal(response.status,owner==='user'?200:500)
})

test('queue redelivery after a successful item commit refreshes progress without processing again',async()=>{
  let handler,processed=0,refreshed=0
  const row={id:1,messageId:2,status:'Needs Processing',User:{id:'u'},extendedOpenAiData:{food_database_search_name:'rice'}}
  const q={select(){return q},eq(){return q},single:async()=>({data:{...row},error:null})}
  load('app/api/queues/process-food-item/process-food-item.ts',{
    'quirrel/next-app':{Queue:(name,fn)=>{handler=fn;return {}}},
    '@supabase/supabase-js':{createClient:()=>({from:()=>q})},
    '@/foodMessageProcessing/processAndMatchLoggedFoodItem':{ProcessLogFoodItem:async()=>{
      processed++;row.status='Processed';throw Error('progress failed after commit')
    }},
    '@/foodMessageProcessing/common/refreshFoodMessageProgress':{refreshFoodMessageProgress:async()=>{refreshed++}}
  })
  await assert.rejects(handler('1'),/after commit/)
  await handler('1');assert.equal(processed,1);assert.equal(refreshed,1)
})

test('failed edits do not recover an older resolved result as success',async()=>{
  const api=load('app/api/protected/user/process-message-quick-log/route.ts',{
    'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
    '@/utils/supabase/GetUserFromRequest':{GetAminoUserOnRequest:async()=>({aminoUser:{id:'user',subscriptionExpiryDate:'2099-01-01'}})},
    '@/foodMessageProcessing/RespondToMessage':{GenerateResponseForQuickLog:async()=>{throw Error('edit failed')}},
    '@/database/GetMessagesForUser':{GetMessageById:async()=>({userId:'user',status:'RESOLVED',itemsToProcess:2,itemsProcessed:2})}
  })
  const response=await api.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({messageId:1,isMessageBeingEdited:true})}))
  assert.equal(response.status,500)
})
for(const fixture of require('./fixtures/food-baseline.json')) {
  if(fixture.expected.grams || fixture.expected.mustNotUseMassShortcut) test(`baseline fixture: ${fixture.id}`,()=>{
    const serving=explicitMassServing(fixture.input)
    if(fixture.expected.mustNotUseMassShortcut)assert.equal(serving,null)
    else {
      assert.equal(serving.total_serving_g_or_ml,fixture.expected.grams)
      const nutrition=calculateNutrientData(serving.total_serving_g_or_ml,{defaultServingWeightGram:158,kcalPerServing:205.4,Nutrient:[]})
      assert.ok(Math.abs(nutrition.kcal-fixture.expected.kcal)<=fixture.expected.kcalTolerance)
    }
  })
}

test('history response bypasses extraction, generic matching and queue insertion',async()=>{
  const reply={resultMessage:'Reused',status:'RESOLVED',itemsProcessed:1,itemsToProcess:1}
  const h=quickLogHarness({extractionFails:true,reuseReply:reply})
  assert.equal(await h.run(),reply);assert.equal(h.queued(),0)
})
test('post-commit history progress failure recovers from saved item counts without retrying work',async()=>{
  let repairs=0
  const saved={id:1,userId:'user',status:'PROCESSING',itemsToProcess:1,itemsProcessed:0}
  const api=load('app/api/protected/user/process-message-quick-log/route.ts',{
    'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
    '@/utils/supabase/GetUserFromRequest':{GetAminoUserOnRequest:async()=>({aminoUser:{id:'user',subscriptionExpiryDate:'2099-01-01'}})},
    '@/foodMessageProcessing/RespondToMessage':{GenerateResponseForQuickLog:async()=>{throw Error('final update failed')}},
    '@/database/GetMessagesForUser':{GetMessageById:async()=>saved},
    '@/foodMessageProcessing/common/refreshFoodMessageProgress':{refreshFoodMessageProgress:async()=>{repairs++;return {...saved,status:'RESOLVED',itemsProcessed:1}}}
  })
  const response=await api.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({messageId:1})}))
  assert.equal(response.status,200);assert.equal((await response.json()).status,'RESOLVED');assert.equal(repairs,1)
})

function agentWorkerHarness({image=false,upc,exact=false,failed=false,refreshFailed=false,foodOverrides={},existingNutrients={},liveResult,itemOverrides={}}={}) {
  const events=[];let completeShadow,saved;const comparison=new Promise(r=>{completeShadow=r})
  const food={id:387,name:'cooked white rice',brand:'',defaultServingWeightGram:158,kcalPerServing:205.4,Nutrient:[],...foodOverrides}
  const api=load('foodMessageProcessing/processAndMatchLoggedFoodItem.ts',{
    '@/foodResolution/agent/live':{tryFoodAgentLive:async()=>{if(liveResult){events.push(['live']);return {food,serving:explicitMassServing('100 g rice'),provenance:{strategy:'jev_gemini',route:'jev',model:'typesafe/jev-test'}}}return null}},
    '@/foodResolution/agent/shadow':{startFoodAgentShadow:input=>{events.push(['start',input]);return comparison},
      finishFoodAgentShadow:async(pending,baseline)=>{if(pending){events.push(['join',baseline]);await pending}}},
    '@/database/GetMessagesForUser':{GetMessageById:async()=>({id:1,content:'100 g rice',hasimages:image,createdAt:'2026-09-23T12:00:00Z'})},
    './findExactLocalFood':{findExactLocalFood:async()=>exact?food:null},
    './findFoodByUPC/findFoodByUPC':{findFoodByUPC:async()=>null},
    '@/utils/embeddingsCache/getCachedOrFetchEmbeddings':{getCachedOrFetchEmbeddings:async()=>[{id:3}]},
    '@/utils/foodEmbedding':{foodToLogEmbedding:async()=>({embedding_cache_id:4})},
    './getBestFoodEmbeddingMatches/getBestFoodEmbeddingMatches':{getBestFoodEmbeddingMatches:async()=>[{id:387,name:'cooked white rice'},{externalId:'usda',name:'external rice'}]},
    './findBestLoggedFoodItemMatchToFood':{findBestLoggedFoodItemMatchToFood:async()=>{if(liveResult)assert.fail('Live match must skip legacy matching');if(failed)throw Error('matcher failed');return [food,null]}},
    './getServingSizeFromFoodItem/getServingSizeFromFoodItem':{findBestServingMatchChatGemini:async item=>{if(liveResult)assert.fail('Live match must skip model serving');return {...item,serving:explicitMassServing(item.full_item_user_message_including_serving)}}},
    './common/calculateNutrientData':{calculateNutrientData},
    './common/updateLoggedFoodItemData':{updateLoggedFoodItemWithData:async(id,data)=>{events.push(['save']);saved=data;return data}},
    './common/refreshFoodMessageProgress':{refreshFoodMessageProgress:async()=>{events.push(['progress']);if(refreshFailed)throw Error('refresh failed')}},
    './foodIconsProcess':{LinkIconsOrCreateIfNeeded:async()=>{}}
  })
  return {events,completeShadow,saved:()=>saved,run:()=>api.ProcessLogFoodItem({id:10,...existingNutrients},
    {food_database_search_name:'cooked white rice',full_item_user_message_including_serving:'100 g cooked white rice',upc,...itemOverrides},1,{id:'user',tzIdentifier:'UTC'})}
}
test('image/exact and legacy paths cannot mark plain chicken as covering an explicit oil dressing',async()=>{
 for(const options of [{image:true,exact:true},{image:true,exact:false}]){
  const h=agentWorkerHarness({...options,foodOverrides:{name:'chicken breast'},itemOverrides:{food_database_search_name:'Whole Chicken Breast',full_item_user_message_including_serving:'Whole chicken breast with olive oil and vinegar dressing'}})
  await h.run();assert.equal(h.saved().status,'Matching Failed');assert.equal(h.saved().kcal,undefined)
 }
})
test('explicit additions increase the authoritative item count before queue dispatch',async()=>{
 const h=quickLogHarness({expectedCount:2,extracted:[{food_database_search_name:'Whole Chicken Breast',full_item_user_message_including_serving:'Whole chicken breast with olive oil and vinegar dressing',branded:false}]})
 const r=await h.run();assert.equal(h.queued(),2);assert.equal(r.itemsToProcess,2);assert.equal(r.itemsProcessed,2)
})
test('live match uses the existing save/progress path without a second matcher, serving model or shadow run',async()=>{
 const h=agentWorkerHarness({liveResult:true});await h.run()
 assert.equal(h.saved().status,'Processed');assert.equal(h.saved().foodItemId,387);assert.equal(h.saved().grams,100);assert.equal(h.saved().kcal,130)
 assert.equal(h.saved().extendedOpenAiData.resolution.strategy,'jev_gemini')
 assert.deepEqual(h.events.map(e=>e[0]),['live','save','progress'])
})
test('shadow comparison joins only after baseline food and progress commit',async()=>{
  const h=agentWorkerHarness();const work=h.run()
  await new Promise(setImmediate)
  assert.equal(h.saved().status,'Processed');assert.equal(h.saved().kcal,130)
  assert.deepEqual(h.events.map(e=>e[0]),['start','save','progress','join'])
  assert.equal(h.events[0][1].candidates.length,1)
  assert.equal(h.events[3][1].foodId,387)
  h.completeShadow({status:'invalid_proposal'});await work
  assert.equal(h.saved().status,'Processed')
})
test('exact foods, image-derived foods and barcode fallbacks do not start text agents',async()=>{
  for(const options of [{exact:true},{image:true},{upc:1234}]){
    const h=agentWorkerHarness(options);await h.run()
    assert.equal(h.saved().status,'Processed');assert.ok(!h.events.some(e=>e[0]==='start'))
  }
})
test('failed baseline and progress refresh errors still join shadow without saving proposals',async()=>{
  const failed=agentWorkerHarness({failed:true});failed.completeShadow({status:'matched',resolution:{foodId:7,grams:900}})
  await failed.run();assert.equal(failed.saved().status,'Matching Failed');assert.equal(failed.saved().foodItemId,undefined)
  const refresh=agentWorkerHarness({refreshFailed:true});refresh.completeShadow(null)
  await assert.rejects(refresh.run(),/refresh failed/)
  assert.equal(refresh.saved().status,'Processed');assert.ok(refresh.events.some(e=>e[0]==='join'))
})

test('shared worker validation rejects missing/impossible nutrition even on exact matches',async()=>{
  for(const foodOverrides of [{kcalPerServing:null},{kcalPerServing:1800,defaultServingWeightGram:100},{proteinPerServing:900},{defaultServingWeightGram:0},{weightUnknown:true}]){
    const h=agentWorkerHarness({exact:true,foodOverrides});await h.run()
    assert.equal(h.saved().status,'Matching Failed');assert.equal(h.saved().foodItemId,undefined)
  }
})
test('valid catalogue calories preserve unknown macros instead of writing zeros',async()=>{
  const h=agentWorkerHarness({exact:true});await h.run()
  assert.equal(h.saved().status,'Processed');assert.equal(h.saved().kcal,130)
  assert.equal(h.saved().proteinG,null);assert.equal(h.saved().carbG,null);assert.equal(h.saved().totalFatG,null)
})
test('complete pre-existing nutrition cannot bypass the shared plausibility checks',async()=>{
  const h=agentWorkerHarness({exact:true,existingNutrients:{kcal:1800,proteinG:0,carbG:0,totalFatG:0}})
  await h.run();assert.equal(h.saved().status,'Matching Failed')
})

test('a combined branded coffee queues independent components and preserves partial success',async()=>{
 for(const milkStatus of ['Processed','Matching Failed']){
  const h=quickLogHarness({expectedCount:2,extracted:[{food_database_search_name:'coffee with Fairlife milk',full_item_user_message_including_serving:'coffee with Fairlife milk cup',brand:'Fairlife',branded:true}],foodStatus:(_food,index)=>index===0?'Processed':milkStatus})
  const result=await h.run()
  assert.equal(h.queued(),2);assert.equal(result.itemsToProcess,2)
  assert.equal(h.queuedFoods[0].branded,false);assert.equal(h.queuedFoods[1].brand,'Fairlife')
  assert.equal(result.itemsProcessed,milkStatus==='Processed'?2:1)
  assert.equal(result.status,milkStatus==='Processed'?'RESOLVED':'FAILED')
 }
})
