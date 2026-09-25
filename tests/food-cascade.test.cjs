const {test}=require('node:test'),assert=require('node:assert/strict')
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {resolveFoodCascade}=require('../src/foodResolution/agent/cascade.ts')
const {resolveFoodAgent}=require('../src/foodResolution/agent/resolve.ts')
const {selectionTask,unsupportedNutritionInput}=require('../src/foodResolution/agent/selection.ts')
const {selectWithJev}=require('../src/ai/jev.ts')
const {createAgentEvidence}=require('../src/foodResolution/agent/evidence.ts')
const {foodConfig}=require('../src/foodResolution/config.ts')
const {MockLanguageModelV3}=require('ai/test')
const {cases}=require('../scripts/food-agent/benchmark-fixtures.cjs')
const c=cases[0],rice=c.foods.find(f=>f.id===11)
const input={user:{id:'synthetic-a',tzIdentifier:'UTC'},messageId:3,referenceTime:'2026-09-23T12:00:00Z',item:c.item,candidates:c.foods.map(({id,name,brand})=>({id,name,brand}))}
const emptyHistory={disposition:'none',truncated:false,candidates:[]}
const match={decision:'match',foodId:11,servingId:null},none={decision:'unmatched',foodId:null,servingId:null}
const call=(toolName,args,id='a')=>({type:'tool-call',toolCallId:id,toolName,input:JSON.stringify(args)})
const step=(...content)=>({content,finishReason:{unified:'tool-calls',raw:'tool_calls'},warnings:[],usage:{inputTokens:{total:20},outputTokens:{total:5}},providerMetadata:{openrouter:{usage:{cost:.001}}}})
function fixture(overrides={}){
 const foods=new Map(),reads=[]
 return {foods,reads,getFoodsAndServings:async ids=>{reads.push(['batch',ids]);const found=c.foods.filter(f=>ids.includes(f.id));found.forEach(f=>foods.set(f.id,f));return found},
 getFoodAndServings:async id=>{reads.push(['food',id]);const f=c.foods.find(f=>f.id===id);if(f)foods.set(id,f);return f??null},
 searchFoodCandidates:async query=>{reads.push(['search',query]);return input.candidates},searchUserFoodHistory:async query=>{reads.push(['history',query]);return emptyHistory},...overrides}
}
const selected=(t,confidence=.99)=>({status:'ok',model:'typesafe/jev-test',choice:Object.entries(t.options).find(([,p])=>p?.foodId===11&&p.servingId===null)?.[0]??'none',confidence,durationMs:1,promptTokens:10,completionTokens:2,costUsd:.0001})
function modelWith(...steps){const model=new MockLanguageModelV3({doGenerate:steps});return {model,configure:()=>({id:'gemini-test',provider:'mock',model})}}
test('high-confidence Jev match uses one selection with batched prefetch and no Gemini',async()=>{
 const e=fixture();let selections=0
 const result=await resolveFoodCascade(input,{evidence:()=>e,env:{},select:async t=>{selections++;return selected(t)},fallback:()=>assert.fail('No fallback'),fallbackEnabled:true})
 assert.equal(result.status,'matched');assert.equal(result.resolution.kcal,130);assert.equal(result.route,'jev')
 assert.equal(result.toolCalls,2);assert.equal(result.steps,1);assert.equal(result.costUsd,.0001);assert.equal(selections,1)
 assert.equal(e.reads.filter(r=>r[0]==='batch').length,1)
})
test('uncertain selection finishes in one Gemini turn from already supplied evidence',async()=>{
 const e=fixture(),m=modelWith(step(call('proposeResolution',match)))
 const result=await resolveFoodCascade(input,{evidence:()=>e,env:{},select:async t=>selected(t,.6),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'matched');assert.equal(result.route,'gemini');assert.equal(result.fallbackReason,'low_confidence')
 assert.equal(result.steps,2);assert.equal(result.toolCalls,2);assert.equal(result.costUsd,.0011)
 assert.equal(m.model.doGenerateCalls.length,1);assert.ok(!e.reads.some(r=>r[0]==='food'))
 assert.match(JSON.stringify(m.model.doGenerateCalls[0].prompt),/prefetched/)
})
test('empty retrieval escalates to a search with bounded detail hydration, then a proposal',async()=>{
 let searches=0
 const e=fixture({searchFoodCandidates:async()=>++searches===1?[]:input.candidates})
 const m=modelWith(step(call('searchFoodCandidates',{query:'white rice'})),step(call('proposeResolution',match)))
 const result=await resolveFoodCascade({...input,candidates:[]},{evidence:()=>e,env:{},select:()=>assert.fail('No candidates for Jev'),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'matched');assert.equal(result.fallbackReason,'no_valid_options');assert.equal(result.resolution.kcal,130)
 assert.equal(result.steps,2);assert.equal(result.toolCalls,4);assert.equal(searches,2)
 assert.equal(e.reads.filter(r=>r[0]==='batch').length,1);assert.ok(!e.reads.some(r=>r[0]==='food'))
})

test('a second search can recover authoritative evidence before the final proposal turn',async()=>{
 let searches=0
 const e=fixture({searchFoodCandidates:async()=>++searches<3?[]:input.candidates})
 const m=modelWith(step(call('searchFoodCandidates',{query:'wrong name'})),step(call('searchFoodCandidates',{query:'white rice'})),step(call('proposeResolution',match)))
 const result=await resolveFoodCascade({...input,candidates:[]},{env:{},evidence:()=>e,fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'matched');assert.equal(result.steps,3);assert.equal(result.toolCalls,5)
})

test('invalid nutrition returned by search hydration cannot support or appear in a proposal',async()=>{
 let searches=0
 const bad={...rice,kcalPerServing:null},e=fixture({searchFoodCandidates:async()=>++searches===1?[]:input.candidates})
 e.getFoodsAndServings=async()=>{e.foods.set(11,bad);return [bad]}
 const m=modelWith(step(call('searchFoodCandidates',{query:'rice'})),step(call('proposeResolution',match)))
 const result=await resolveFoodCascade({...input,candidates:[]},{env:{},evidence:()=>e,fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'invalid_proposal');assert.doesNotMatch(JSON.stringify(m.model.doGenerateCalls[1].prompt),/kcalPerServing/)
})
test('invalid nutrition cannot be shown as an option or retrieved as usable evidence',async()=>{
 const bad={...rice,kcalPerServing:null},foods=new Map()
 const e=fixture({foods,getFoodsAndServings:async()=>{foods.set(11,bad);return [bad]},getFoodAndServings:async()=>bad})
 const m=modelWith(step(call('getFoodAndServings',{foodId:11})),step(call('proposeResolution',match)))
 const result=await resolveFoodCascade({...input,candidates:[{id:11,name:rice.name,brand:null}]},{evidence:()=>e,env:{},select:()=>assert.fail('Invalid candidate'),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'invalid_proposal');assert.equal(result.candidateCount,0)
 assert.doesNotMatch(JSON.stringify(m.model.doGenerateCalls[0].prompt),/kcalPerServing/)
})
test('history failure skips Jev and is disclosed to the fallback instead of looking empty',async()=>{
 const e=fixture({searchUserFoodHistory:async()=>{throw Error('private error')}}),m=modelWith(step(call('proposeResolution',match)))
 const result=await resolveFoodCascade(input,{evidence:()=>e,env:{},select:()=>assert.fail('Incomplete history'),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.route,'gemini');assert.equal(result.fallbackReason,'prefetch_incomplete');assert.equal(result.toolErrors,1)
 const prompt=JSON.stringify(m.model.doGenerateCalls[0].prompt);assert.match(prompt,/prefetchIncomplete\\?":true/);assert.doesNotMatch(prompt,/private error/)
})
test('an abstention after failed evidence reads is unavailable, not a confirmed unmatched result',async()=>{
 const e=fixture({searchUserFoodHistory:async()=>{throw Error('read failed')}}),m=modelWith(step(call('proposeResolution',none)))
 const result=await resolveFoodCascade(input,{env:{},evidence:()=>e,select:()=>assert.fail('Incomplete evidence'),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'unavailable');assert.equal(result.toolErrors,1);assert.equal(result.resolution,undefined)
})
test('selector failure falls back within the same run and leaves missing cost unknown',async()=>{
 const m=modelWith(step(call('proposeResolution',match)))
 const result=await resolveFoodCascade(input,{evidence:()=>fixture(),env:{},select:async()=>({status:'unavailable',model:'jev',durationMs:1,promptTokens:0,completionTokens:0}),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'matched');assert.equal(result.fallbackReason,'selector_unavailable');assert.equal(result.costUsd,undefined)
})
test('history-discovered food IDs are batch-read before selection',async()=>{
 const beta={...rice,id:99,name:'Cooked white rice',Serving:[]},e=fixture()
 e.searchUserFoodHistory=async()=>({disposition:'ranked_foods',truncated:false,candidates:[{messageId:8,occurrenceDays:5,foods:[{foodId:99,name:beta.name,brand:null,grams:100}]}]})
 const original=e.getFoodsAndServings;e.getFoodsAndServings=async ids=>{const out=await original(ids);if(ids.includes(99)){e.foods.set(99,beta);out.push(beta)}return out}
 const result=await resolveFoodCascade(input,{evidence:()=>e,env:{},select:async t=>{assert.ok(t.state.foods.some(f=>f.id===99));return selected(t)}})
 assert.equal(result.status,'matched');assert.equal(result.toolCalls,3);assert.ok(e.reads.some(r=>r[0]==='batch'&&r[1].includes(99)))
})
test('all stages share one deadline, including a hung prefetch or selector',async()=>{
 for(const stage of ['prefetch','selector']){
  let signal,started=performance.now()
  const result=await resolveFoodCascade(input,{env:{},deadlineMs:25,evidence:(_,s)=>{signal=s;return fixture(stage==='prefetch'?{getFoodsAndServings:async()=>new Promise(()=>{})}:{})},
   select:async()=>new Promise(()=>{}),fallback:()=>assert.fail('No new work after deadline'),fallbackEnabled:true})
  assert.equal(result.status,'deadline');assert.ok(signal.aborted);assert.ok(performance.now()-started<300)
 }
})
test('fallback gets only remaining time and tool budget; parent cancellation reaches SDK',async()=>{
 let remaining,signal
 const start=performance.now()
 const result=await resolveFoodCascade(input,{env:{},deadlineMs:60,evidence:()=>fixture(),select:async t=>{await new Promise(r=>setTimeout(r,20));return selected(t,.1)},fallbackEnabled:true,
 fallback:async(i,d)=>{remaining=d.deadlineMs;assert.equal(d.remainingToolCalls,4);signal=d.abortSignal;return new Promise(()=>{})}})
 assert.equal(result.status,'deadline');assert.ok(remaining<50);assert.ok(signal.aborted);assert.ok(performance.now()-start<250)
})
test('Gemini retrieval limit includes the prefetch calls',async()=>{
 const m=modelWith(step(...Array.from({length:6},(_,i)=>call('searchFoodCandidates',{query:'rice'},String(i)))),step(call('proposeResolution',none)))
 const result=await resolveFoodCascade(input,{env:{},evidence:()=>fixture(),select:async t=>selected(t,.1),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'budget_exhausted');assert.equal(result.toolCalls,6)
})
test('prefetched cache entries omitted from the prompt cannot be used without a read',async()=>{
 const e=fixture();e.foods.set(11,rice);const m=modelWith(step(call('proposeResolution',match)))
 const result=await resolveFoodAgent(input,{evidence:()=>e,model:m.configure,prepared:{foods:[],history:emptyHistory,prefetchIncomplete:false}})
 assert.equal(result.status,'invalid_proposal')
})
test('calorie/protein targets explicitly remain unsupported and ordinary protein powder is allowed',async()=>{
 for(const text of ['250cals of kefire','700 cal Sweetgreen salad','chocolate protein bar with 25g of protein']){
 const result=await resolveFoodCascade({...input,item:{...input.item,full_item_user_message_including_serving:text}},{env:{},evidence:()=>assert.fail('Unsupported constraint must not query'),select:()=>assert.fail('No model')})
 assert.equal(result.status,'unsupported_input');assert.equal(result.fallbackReason,'nutrition_constraints')}
 for(const text of ['100 g protein powder','100 g fat-free yogurt'])assert.equal(unsupportedNutritionInput({...input,item:{...input.item,full_item_user_message_including_serving:text}}),false)
 assert.equal(unsupportedNutritionInput({...input,item:{...input.item,nutritional_information:{kcal:250}}}),true)
})
test('selector and fallback cohorts are independent, shadow-only and fail closed',async()=>{
 const env={FOOD_FAST_SELECTOR:'shadow',FOOD_FAST_SELECTOR_PERCENT:'100',FOOD_AGENT_FALLBACK:'shadow',FOOD_AGENT_FALLBACK_PERCENT:'100'}
 assert.equal(foodConfig('a',{}).features.fast_selector,'off');assert.equal(foodConfig('a',env).features.agent_fallback,'shadow')
 assert.equal(foodConfig('a',{...env,FOOD_FAST_SELECTOR:'off'}).features.agent_fallback,'off')
 assert.equal(foodConfig('a',{...env,FOOD_AGENT_FALLBACK:'on'}).features.agent_fallback,'off')
 assert.equal(foodConfig('a',{...env,FOOD_KILL_SWITCH:'true'}).features.fast_selector,'off')
 const result=await resolveFoodCascade(input,{env:{},evidence:()=>fixture(),select:async t=>selected(t,.1),fallback:()=>assert.fail('Fallback disabled')})
 assert.equal(result.status,'fallback_disabled')
 for(const value of ['','NaN','0','-1','2'])assert.equal((await resolveFoodCascade(input,{env:{FOOD_SELECTOR_MIN_CONFIDENCE:value},evidence:()=>assert.fail('Invalid policy')})).status,'unavailable')
})
test('Jev request uses only the dedicated endpoint and rejects invalid typed responses',async()=>{
 const task=selectionTask(input,c.foods,emptyHistory),key=Object.keys(task.options).find(k=>k!=='none')
 for(const change of [{},{choice:'invented'},{confidence:2},{confidence:'0.99'},{type:'noul'}]){
 let sent
 const result=await selectWithJev(task,new AbortController().signal,{env:{OPEN_ROUTER_API_KEY:'test-key'},fetch:async(url,opts)=>{
  sent={url,opts};return Response.json({answers:{selection:{type:'choice',choice:key,confidence:.99,...change}},usage:{cost:.0001,input_tokens:100,output_tokens:4}})}})
 assert.equal(sent.url,'https://openrouter.ai/api/alpha/decisions');assert.equal(JSON.parse(sent.opts.body).model,'typesafe/jev-1.13')
 assert.equal(result.status,Object.keys(change).length?'invalid_response':'ok');assert.equal(result.costUsd,.0001)
 assert.doesNotMatch(JSON.stringify(result),/test-key|synthetic-a/)
 }
})
test('Jev has a bounded local timeout even when fetch ignores cancellation',async()=>{
 let signal;const start=performance.now()
 const result=await selectWithJev(selectionTask(input,c.foods,emptyHistory),new AbortController().signal,{env:{OPENROUTER_API_KEY:'test-key'},timeoutMs:15,fetch:async(_,options)=>{signal=options.signal;return new Promise(()=>{})}})
 assert.equal(result.status,'unavailable');assert.ok(signal.aborted);assert.ok(performance.now()-start<200)
})
test('batch evidence admits only discovered IDs, caps reads and is read-only',async()=>{
 const calls=[];const db={from(table){assert.equal(table,'FoodItem');const steps=[];calls.push(steps);const q=new Proxy({}, {get(_,method){
 if(method==='then')return resolve=>resolve({data:[rice],error:null});if(['insert','update','upsert','delete'].includes(method))assert.fail('Write')
 return (...args)=>{steps.push([method,...args]);return q}
 }});return q}}
 const signal=new AbortController().signal,e=createAgentEvidence(input,signal,db)
 assert.deepEqual(await e.getFoodsAndServings([999]),[]);assert.equal(calls.length,0)
 await e.getFoodsAndServings([11,11,999]);assert.deepEqual(calls[0].find(s=>s[0]==='in')[2],[11]);assert.ok(calls[0].some(s=>s[0]==='abortSignal'&&s[1]===signal))
 assert.ok(calls[0].some(s=>s[0]==='limit'&&s[1]===20));await e.getFoodsAndServings([11]);assert.equal(calls.length,1)
})

test('truncated servings are bounded and disclosed; Jev cannot treat partial evidence as complete',async()=>{
 const crowded={...rice,Serving:Array.from({length:31},(_,i)=>({id:i+1,foodItemId:11,servingName:'cup',servingWeightGram:158,defaultServingAmount:1}))}
 const db={from(){const q=new Proxy({}, {get(_,method){if(method==='then')return resolve=>resolve({data:[crowded],error:null});return ()=>q}});return q}}
 const e=createAgentEvidence(input,new AbortController().signal,db)
 const [food]=await e.getFoodsAndServings([11]);assert.equal(food.Serving.length,30);assert.equal(food.servingsTruncated,true)
 const source=fixture({getFoodsAndServings:async()=>{source.foods.set(11,food);return [food]}})
 const m=modelWith(step(call('proposeResolution',match)))
 const result=await resolveFoodCascade(input,{env:{},evidence:()=>source,select:()=>assert.fail('Partial evidence must bypass Jev'),fallbackEnabled:true,fallbackModel:m.configure})
 assert.equal(result.status,'matched');assert.equal(result.fallbackReason,'prefetch_incomplete')
 assert.match(JSON.stringify(m.model.doGenerateCalls[0].prompt),/servingsTruncated/)
})

test('new shadow route takes precedence, forwards fallback gate and reports only allowlisted metrics',async()=>{
 const cascadeModule=require('../src/foodResolution/agent/cascade.ts'),agentModule=require('../src/foodResolution/agent/resolve.ts')
 const {startFoodAgentShadow,finishFoodAgentShadow}=require('../src/foodResolution/agent/shadow.ts')
 const {foodTrace}=require('../src/foodResolution/telemetry.ts'),{summarize}=require('../scripts/food-baseline/report.cjs')
 const keys=['FOOD_FAST_SELECTOR','FOOD_FAST_SELECTOR_PERCENT','FOOD_AGENT_FALLBACK','FOOD_AGENT_FALLBACK_PERCENT','FOOD_AGENT_TEXT','FOOD_AGENT_TEXT_PERCENT','FOOD_BASELINE_TELEMETRY','FOOD_KILL_SWITCH']
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalCascade=cascadeModule.resolveFoodCascade,originalAgent=agentModule.resolveFoodAgent,info=console.info
 const events=[],gates=[];let legacyRuns=0
 try {
  Object.assign(process.env,{FOOD_FAST_SELECTOR:'shadow',FOOD_FAST_SELECTOR_PERCENT:'100',FOOD_AGENT_FALLBACK:'shadow',FOOD_AGENT_FALLBACK_PERCENT:'100',FOOD_AGENT_TEXT:'shadow',FOOD_AGENT_TEXT_PERCENT:'100',FOOD_BASELINE_TELEMETRY:'true'})
  delete process.env.FOOD_KILL_SWITCH
  console.info=line=>events.push(JSON.parse(line))
  cascadeModule.resolveFoodCascade=async(_,options)=>{gates.push(options.fallbackEnabled);return {status:'unmatched',strategy:'jev_gemini',route:'gemini',fallbackReason:'low_confidence',durationMs:100,selectorConfidence:.5,secret:'never-log-me'}}
  agentModule.resolveFoodAgent=async()=>{legacyRuns++;return {status:'unmatched'}}
  await foodTrace('private-user',1,'text',()=>finishFoodAgentShadow(startFoodAgentShadow(input),undefined))
  process.env.FOOD_AGENT_FALLBACK='off'
  await foodTrace('private-user',2,'text',()=>startFoodAgentShadow(input))
  assert.deepEqual(gates,[true,false]);assert.equal(legacyRuns,0)
  process.env.FOOD_KILL_SWITCH='true'
  assert.equal(await foodTrace('private-user',3,'text',()=>startFoodAgentShadow(input)),null);assert.equal(gates.length,2)
  const event=events.find(e=>e.stage==='agent_shadow');assert.equal(event.agentRoute,'gemini');assert.equal(event.selectorConfidence,.5)
  const report=summarize([event])[0];assert.deepEqual(report.routes,{gemini:1});assert.deepEqual(report.fallbackReasons,{low_confidence:1})
  assert.doesNotMatch(JSON.stringify(events),/never-log-me|private-user/)
 } finally {
  cascadeModule.resolveFoodCascade=originalCascade;agentModule.resolveFoodAgent=originalAgent;console.info=info
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}
 }
})

test('an already cancelled Jev request and agent perform no provider or evidence work',async()=>{
 const controller=new AbortController();controller.abort()
 const selected=await selectWithJev(selectionTask(input,c.foods,emptyHistory),controller.signal,{env:{OPENROUTER_API_KEY:'test-key'},fetch:()=>assert.fail('Cancelled provider call')})
 assert.equal(selected.status,'unavailable')
 const agent=await resolveFoodAgent(input,{abortSignal:controller.signal,model:()=>assert.fail('Cancelled model'),evidence:()=>assert.fail('Cancelled read')})
 assert.equal(agent.status,'deadline')
})
