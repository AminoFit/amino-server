const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const path = require('node:path')
function load(name, stubs={}, globals={}) {
  const filename=path.resolve('src',name)
  const module={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText,{module,exports:module.exports,process,console,performance,
    require:n=>n in stubs?stubs[n]:require(n),...globals})
  return module.exports
}
const {foodConfig}=load('foodResolution/config.ts')
test('rollouts fail closed, including unimplemented features and malformed percentages',()=>{
  assert.equal(foodConfig('u',{FOOD_HISTORY_SEARCH:'on',FOOD_HISTORY_SEARCH_PERCENT:'100'}).features.history_search,'off')
  for(const percent of ['NaN','101','-1','']) assert.equal(foodConfig('u',{
    FOOD_HISTORY_SEARCH:'on',FOOD_HISTORY_SEARCH_PERCENT:percent},{history_search:['on']}).features.history_search,'off')
  assert.equal(foodConfig('u',{FOOD_HISTORY_SEARCH:'on',FOOD_HISTORY_SEARCH_PERCENT:'100',FOOD_KILL_SWITCH:'true'},
    {history_search:['on']}).features.history_search,'off')
})
test('cohorts are stable and grounded import requires live grounding',()=>{
  const env={FOOD_HISTORY_SEARCH:'shadow',FOOD_HISTORY_SEARCH_PERCENT:'50',FOOD_GROUNDED_IMPORT:'on',FOOD_GROUNDED_IMPORT_PERCENT:'100'}
  const capabilities={history_search:['shadow'],grounded_import:['on']}
  const modes=Array.from({length:100},(_,i)=>foodConfig(String(i),env,capabilities).features.history_search)
  assert.ok(modes.includes('off')&&modes.includes('shadow'))
  for(let i=0;i<100;i++)assert.equal(modes[i],foodConfig(String(i),env,capabilities).features.history_search)
  assert.equal(foodConfig('u',env,capabilities).features.grounded_import,'off')
})
test('telemetry isolates concurrent contexts and never emits extra sensitive fields',async()=>{
  const events=[]
  const api=load('foodResolution/telemetry.ts',{'./config':{foodConfig:()=>({telemetry:true,version:'test',features:{}})}},
    {console:{info:s=>events.push(JSON.parse(s))}})
  await Promise.all([1,2].map(id=>api.foodTrace('secret-user',id,'text',async()=>{
    await Promise.resolve();api.foodMetric('check',1,'ok',{model:'test',prompt:'private',apiKey:'secret'})
    return {status:'RESOLVED',itemsProcessed:1}
  })))
  assert.equal(events.length,4)
  for(const id of [1,2])assert.equal(new Set(events.filter(e=>e.messageId===id).map(e=>e.traceId)).size,1)
  assert.equal(new Set(events.map(e=>e.traceId)).size,2)
  assert.doesNotMatch(JSON.stringify(events),/secret|private/)
})
test('broken telemetry does not affect processing',async()=>{
  const api=load('foodResolution/telemetry.ts',{'./config':{foodConfig:()=>({telemetry:true})}},
    {console:{info(){throw Error('log sink failed')}}})
  assert.equal(await api.foodTrace('u',1,'text',()=>api.foodStage('test',async()=>42)),42)
  await assert.rejects(api.foodTrace('u',1,'text',()=>api.foodStage('test',async()=>{throw Error('original')})),/original/)
})
test('model adapter forwards options and user without changing defaults or errors',async()=>{
  const options={systemPrompt:'s',userMessage:'u',max_tokens:42};const user={id:'u'}
  const api=load('foodResolution/model.ts',{
    '@/languageModelProviders/gemini/foodCompletion':{FOOD_REASONING_MODEL:'existing',foodCompletion:async(o,u)=>{
      assert.equal(o,options);assert.equal(u,user);return '{"ok":true}'
    }},'./telemetry':{foodStage:(s,fn)=>fn()}
  })
  assert.equal(await api.foodCompletion(options,user),'{"ok":true}')
  assert.equal(api.FOOD_REASONING_MODEL,'existing')
})
test('report separates input classes and leaves unavailable costs unknown',()=>{
  const {summarize}=require('../scripts/food-baseline/report.cjs')
  const rows=summarize([10,20,30].map(durationMs=>({event:'food_baseline',version:1,inputClass:'text',stage:'request',durationMs,status:'RESOLVED'})))
  assert.equal(rows[0].p50Ms,20);assert.equal(rows[0].p95Ms,30)
  assert.equal(rows[0].reportedCostUsd,null);assert.equal(rows[0].statuses.RESOLVED,3)
})

test('disabled telemetry emits nothing',async()=>{
  const api=load('foodResolution/telemetry.ts',{'./config':{foodConfig:()=>({telemetry:false})}},
    {console:{info(){assert.fail('telemetry must remain off')}}})
  assert.equal(await api.foodTrace('u',1,'text',async()=>42),42)
})

test('only shadow history is implemented, with default configuration off',()=>{
  assert.equal(foodConfig('u',{}).features.history_search,'off')
  assert.equal(foodConfig('u',{FOOD_HISTORY_SEARCH:'shadow',FOOD_HISTORY_SEARCH_PERCENT:'100'}).features.history_search,'shadow')
  assert.equal(foodConfig('u',{FOOD_HISTORY_SEARCH:'on',FOOD_HISTORY_SEARCH_PERCENT:'100'}).features.history_search,'off')
})

test('live history reuse requires its own explicit cohort and obeys the kill switch',()=>{
  assert.equal(foodConfig('u',{FOOD_HISTORY_SEARCH:'shadow',FOOD_HISTORY_SEARCH_PERCENT:'100'}).features.history_reuse,'off')
  const env={FOOD_HISTORY_REUSE:'on',FOOD_HISTORY_REUSE_PERCENT:'100'}
  assert.equal(foodConfig('u',env).features.history_reuse,'on')
  assert.equal(foodConfig('u',{...env,FOOD_KILL_SWITCH:'true'}).features.history_reuse,'off')
})
