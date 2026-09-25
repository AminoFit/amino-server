const {test} = require('node:test')
const assert = require('node:assert/strict')
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}})
require('tsconfig-paths/register')
const {MockLanguageModelV3} = require('ai/test')
const {resolveFoodAgent,AGENT_LIMITS} = require('../src/foodResolution/agent/resolve.ts')
const {validateProposal} = require('../src/foodResolution/agent/validate.ts')
const {createAgentEvidence} = require('../src/foodResolution/agent/evidence.ts')
const {agentModel} = require('../src/foodResolution/agent/model.ts')
const {foodConfig} = require('../src/foodResolution/config.ts')
const rice = {id:387,name:'Cooked white rice',brand:null,weightUnknown:false,defaultServingWeightGram:158,
  kcalPerServing:205.4,proteinPerServing:null,carbPerServing:45,totalFatPerServing:0,
  Serving:[{id:17,foodItemId:387,servingName:'cup',defaultServingAmount:1,servingWeightGram:158}]}
const input = {user:{id:'user-a',tzIdentifier:'America/New_York'},messageId:3,referenceTime:'2026-09-23T12:00:00Z',
  item:{food_database_search_name:'cooked white rice',full_item_user_message_including_serving:'100 g cooked white rice',branded:false},
  candidates:[{id:387,name:rice.name,brand:null}]}
const proposal = {decision:'match',foodId:387,servingId:null}
const unmatched = {decision:'unmatched',foodId:null,servingId:null}
const call = (toolName,args,id='call')=>({type:'tool-call',toolCallId:id,toolName,input:JSON.stringify(args)})
const step = (...content)=>({content,finishReason:{unified:'tool-calls',raw:'tool_calls'},warnings:[],
  usage:{inputTokens:{total:20},outputTokens:{total:5}}})
function harness(steps, overrides={}) {
  const model = new MockLanguageModelV3({doGenerate:steps})
  const foods = new Map()
  let reads=0
  const evidence = {foods,searchFoodCandidates:async()=>input.candidates,searchUserFoodHistory:async()=>({candidates:[]}),
    getFoodAndServings:async id=>{reads++;if(id!==rice.id)return null;foods.set(id,rice);return rice},...overrides}
  return {model,foods,evidence,reads:()=>reads,run:(options={})=>resolveFoodAgent(input,{model:()=>({id:'test',provider:'mock',model}),evidence:()=>evidence,...options})}
}
test('typed SDK loop reads authoritative food and proposes 100 g / 130 kcal',async()=>{
  const h=harness([step(call('getFoodAndServings',{foodId:387})),step(call('proposeResolution',proposal))])
  const result=await h.run()
  assert.equal(result.status,'matched');assert.equal(result.resolution.grams,100);assert.equal(result.resolution.kcal,130)
  assert.equal(result.resolution.proteinG,null);assert.equal(result.resolution.totalFatG,0)
  assert.equal(result.steps,2);assert.equal(result.toolCalls,1);assert.equal(result.promptTokens,40)
  assert.equal(h.model.doGenerateCalls.length,2)
})
test('unread, invented, wrong-brand and raw/cooked IDs cannot validate',()=>{
  assert.equal(validateProposal(proposal,input.item,new Map()),null)
  for(const changes of [{id:9},{name:'Raw white rice'},{name:'White rice'},{weightUnknown:true},{defaultServingWeightGram:0}])
    assert.equal(validateProposal(proposal,input.item,new Map([[387,{...rice,...changes}]])),null)
  assert.equal(validateProposal(proposal,{...input.item,branded:true,brand:'Brand A'},new Map([[387,{...rice,brand:'Brand B'}]])),null)
  assert.equal(validateProposal(proposal,{...input.item,branded:true},new Map([[387,rice]])),null)
})
test('explicit kilograms and stored household servings use deterministic arithmetic',()=>{
  const foods=new Map([[387,rice]])
  assert.equal(validateProposal(proposal,{...input.item,full_item_user_message_including_serving:'0.5 kg cooked white rice'},foods).grams,500)
  assert.equal(validateProposal({...proposal,servingId:17},{...input.item,full_item_user_message_including_serving:'two cups cooked white rice'},foods).grams,316)
  for(const text of ['1 bowl cooked white rice','1 heaped cup cooked white rice','1 cup cooked white rice 2 servings','100-200 g cooked white rice','0 g cooked white rice','100 ml cooked white rice','same rice as yesterday'])
    assert.equal(validateProposal({...proposal,servingId:17},{...input.item,full_item_user_message_including_serving:text},foods),null,text)
  assert.equal(validateProposal({...proposal,servingId:999},input.item,foods),null)
  assert.equal(validateProposal({...proposal,servingId:17},input.item,foods),null)
})
test('missing or impossible nutrition and mismatched serving ownership fail validation',()=>{
  for(const changes of [{kcalPerServing:null},{kcalPerServing:Infinity},{kcalPerServing:9999},{proteinPerServing:900},
    {Serving:[{...rice.Serving[0],foodItemId:2}]}]) {
    const household={...input.item,full_item_user_message_including_serving:'1 cup cooked white rice'}
    assert.equal(validateProposal({...proposal,servingId:17},household,new Map([[387,{...rice,...changes}]])),null)
  }
})
test('no model-invented nutrition fields can pass the strict tool schema',async()=>{
  const h=harness([step(call('getFoodAndServings',{foodId:387})),step(call('proposeResolution',{...proposal,grams:1,kcal:1}))])
  assert.notEqual((await h.run()).status,'matched')
})
test('multiple final proposals and proposals without evidence are rejected',async()=>{
  for(const steps of [[step(call('proposeResolution',proposal))],
    [step(call('getFoodAndServings',{foodId:387})),step(call('proposeResolution',proposal,'a'),call('proposeResolution',unmatched,'b'))]]) {
    assert.equal((await harness(steps).run()).status,'invalid_proposal')
  }
})
test('retrieval concurrency and total calls are bounded even in one oversized tool batch',async()=>{
  let active=0,max=0,reads=0
  const h=harness([step(...Array.from({length:12},(_,i)=>call('searchFoodCandidates',{query:'rice'},String(i)))),step(call('proposeResolution',unmatched))],{
    searchFoodCandidates:async()=>{reads++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,5));active--;return []}
  })
  const result=await h.run()
  assert.equal(result.status,'budget_exhausted');assert.equal(reads,6);assert.equal(max,2);assert.equal(result.toolCalls,6)
})
test('third turn can only finish; looping never exceeds three provider calls',async()=>{
  const h=harness([step(call('searchFoodCandidates',{query:'rice'},'a')),step(call('getFoodAndServings',{foodId:387},'b')),step(call('proposeResolution',proposal))])
  assert.equal((await h.run()).status,'matched')
  assert.equal(h.model.doGenerateCalls.length,3)
  assert.deepEqual(h.model.doGenerateCalls[2].tools.map(t=>t.name),['proposeResolution'])
})
test('provider errors are not retried and cannot become successful guesses',async()=>{
  const h=harness(async()=>{throw Error('secret provider detail')})
  const result=await h.run()
  assert.equal(result.status,'unavailable');assert.equal(h.model.doGenerateCalls.length,1)
  assert.doesNotMatch(JSON.stringify(result),/secret/)
})
test('deadline aborts tools and provider calls, even if transport ignores cancellation',async()=>{
  let signal
  const h=harness(async options=>{signal=options.abortSignal;return new Promise(()=>{})})
  const start=performance.now();const result=await h.run({deadlineMs:25})
  assert.equal(result.status,'deadline');assert.ok(signal.aborted);assert.ok(performance.now()-start<500)
})
test('tool errors remain observable and model can explicitly return unmatched',async()=>{
  const h=harness([step(call('searchFoodCandidates',{query:'rice'})),step(call('proposeResolution',unmatched))],{searchFoodCandidates:async()=>{throw Error('database error with secrets')}})
  const result=await h.run();assert.equal(result.status,'unmatched');assert.equal(result.toolErrors,1)
  assert.doesNotMatch(JSON.stringify(h.model.doGenerateCalls),/secrets/)
})
test('agent is independently gated, shadow-only, default-off and kill-switchable',()=>{
  const env={FOOD_AGENT_TEXT:'shadow',FOOD_AGENT_TEXT_PERCENT:'100'}
  assert.equal(foodConfig('a',{}).features.agent_text,'off')
  assert.equal(foodConfig('a',env).features.agent_text,'shadow')
  assert.equal(foodConfig('a',{...env,FOOD_AGENT_TEXT:'on'}).features.agent_text,'off')
  assert.equal(foodConfig('a',{...env,FOOD_KILL_SWITCH:'true'}).features.agent_text,'off')
})
test('agent uses only the approved Flash model through OpenRouter',()=>{
  assert.equal(agentModel({OPENROUTER_API_KEY:'fake'}).id,'google/gemini-3.8-flash')
  assert.equal(agentModel({OPEN_ROUTER_API_KEY:'fake'}).provider,'openrouter')
  assert.throws(()=>agentModel({OPENAI_API_KEY:'fake'}),/OpenRouter unavailable/)
  assert.throws(()=>agentModel({FOOD_REASONING_MODEL:'google/gemini-test',OPENROUTER_API_KEY:'fake'}),/Unsupported food model/)
})
test('evidence reads only: search bounds, discovered IDs and server-bound history owner',async()=>{
  const calls=[]
  const db={from(table){const steps=[];calls.push({table,steps});
    const q=new Proxy({}, {get(_,method){if(method==='then')return (resolve)=>resolve({data:table==='FoodItem'?[]:[],error:null});
      if(method==='maybeSingle')return async()=>({data:rice,error:null});
      if(['insert','update','upsert','delete','rpc'].includes(method))assert.fail('write attempted');
      return (...args)=>{steps.push([method,...args]);return q}
    }});return q}}
  const evidence=createAgentEvidence(input,new AbortController().signal,db)
  assert.equal(await evidence.getFoodAndServings(999),null);assert.equal(calls.length,0)
  await evidence.getFoodAndServings(387);assert.equal(evidence.foods.get(387).id,387)
  await evidence.searchFoodCandidates('rice%,id.eq.999')
  await evidence.searchUserFoodHistory('rice')
  const history=calls.find(c=>c.table==='Message')
  assert.ok(history.steps.some(s=>s[0]==='eq'&&s[1]==='userId'&&s[2]==='user-a'))
  assert.ok(history.steps.some(s=>s[0]==='neq'&&s[1]==='id'&&s[2]===3))
  assert.ok(calls.every(c=>c.steps.some(s=>s[0]==='abortSignal')))
  const search=calls.find(c=>c.steps.some(s=>s[0]==='ilike'))
  assert.ok(search.steps.filter(s=>s[0]==='ilike').every(s=>/^%[\p{L}\p{N}]+%$/u.test(s[2])))
})

test('reported costs are summed only when every completed step reports a cost',async()=>{
  const withCost=(value,cost)=>({...value,providerMetadata:{openrouter:{usage:{cost}}}})
  const h=harness([withCost(step(call('getFoodAndServings',{foodId:387})),.01),withCost(step(call('proposeResolution',proposal)),.02)])
  assert.equal((await h.run()).costUsd,.03)
  assert.equal((await harness([step(call('proposeResolution',unmatched))]).run()).costUsd,undefined)
})
test('tool timeout prevents queued evidence calls from starting after the deadline',async()=>{
  let started=0,signal
  const h=harness([step(...Array.from({length:6},(_,i)=>call('searchFoodCandidates',{query:'rice'},String(i))))])
  const result=await h.run({deadlineMs:20,evidence:(_input,s)=>{signal=s;return {...h.evidence,searchFoodCandidates:async()=>{
    started++;await new Promise(r=>s.addEventListener('abort',r,{once:true}));throw Error('cancelled')
  }}}})
  await new Promise(r=>setTimeout(r,10))
  assert.equal(result.status,'deadline');assert.equal(started,2);assert.ok(signal.aborted)
})

test('shadow admission skips work when off and caps simultaneous runs at two',async()=>{
  const {startFoodAgentShadow,finishFoodAgentShadow}=require('../src/foodResolution/agent/shadow.ts')
  const {foodTrace}=require('../src/foodResolution/telemetry.ts')
  const keys=['FOOD_AGENT_TEXT','FOOD_AGENT_TEXT_PERCENT','FOOD_KILL_SWITCH','FOOD_BASELINE_TELEMETRY']
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));let runs=0;const done=[]
  const run=async()=>{runs++;return new Promise(resolve=>done.push(resolve))}
  try {
    delete process.env.FOOD_AGENT_TEXT;delete process.env.FOOD_KILL_SWITCH
    assert.equal(await foodTrace('u',1,'text',()=>startFoodAgentShadow(input,run)),null);assert.equal(runs,0)
    process.env.FOOD_AGENT_TEXT='shadow';process.env.FOOD_AGENT_TEXT_PERCENT='100'
    const one=foodTrace('u',1,'text',()=>startFoodAgentShadow(input,run))
    const two=foodTrace('u',2,'text',()=>startFoodAgentShadow(input,run))
    assert.equal(await foodTrace('u',3,'text',()=>startFoodAgentShadow(input,run)),null)
    assert.equal(runs,2);done.forEach(resolve=>resolve({status:'unmatched'}));await Promise.all([one,two])
    assert.equal((await foodTrace('u',4,'text',()=>startFoodAgentShadow(input,async()=>({status:'unmatched'})))).status,'unmatched')
    await finishFoodAgentShadow(Promise.reject(Error('unexpected rejection')),undefined)
  } finally {for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}}
})
test('an unavailable agent is not counted as agreeing with an unmatched baseline',async()=>{
  const {finishFoodAgentShadow}=require('../src/foodResolution/agent/shadow.ts')
  const {foodTrace}=require('../src/foodResolution/telemetry.ts')
  const previous=process.env.FOOD_BASELINE_TELEMETRY,info=console.info,events=[]
  try {
    process.env.FOOD_BASELINE_TELEMETRY='true';console.info=line=>events.push(JSON.parse(line))
    await foodTrace('u',1,'text',()=>finishFoodAgentShadow(Promise.resolve({status:'deadline',durationMs:12}),undefined))
    assert.equal(events.find(e=>e.stage==='agent_shadow').agentComparison,'not_comparable')
  } finally {console.info=info;if(previous===undefined)delete process.env.FOOD_BASELINE_TELEMETRY;else process.env.FOOD_BASELINE_TELEMETRY=previous}
})

test('a proposal cannot rely on evidence being fetched in the same model turn',async()=>{
  const h=harness([step(call('getFoodAndServings',{foodId:387},'read'),call('proposeResolution',proposal,'guess'))])
  assert.equal((await h.run()).status,'invalid_proposal')
})
