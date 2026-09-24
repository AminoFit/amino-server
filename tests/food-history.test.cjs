const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript')
function load(file,stubs={},globals={}) {
  const module={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
  }).outputText,{module,exports:module.exports,performance,setTimeout,clearTimeout,AbortController,
    require:n=>n in stubs?stubs[n]:require(n),...globals})
  return module.exports
}
const api=load('foodResolution/history/search.ts',{'./nutrients':load('foodResolution/history/nutrients.ts'),'@/utils/supabase/serverAdmin':{createAdminSupabase(){throw Error('Unexpected database creation')}}})
const request={text:'same smoothie as yesterday',referenceTime:'2026-09-23T14:00:00Z',excludeMessageId:100}
function message(id=1,overrides={}) {
  return {id,userId:'u',content:'smoothie with banana and protein',consumedOn:'2026-09-22T13:00:00Z',createdAt:'2026-09-22T13:00:00Z',
    deletedAt:null,status:'RESOLVED',itemsToProcess:1,itemsProcessed:1,
    LoggedFoodItem:[{id:10+id,userId:'u',deletedAt:null,status:'Processed',foodItemId:6,grams:100,kcal:55,
      servingAmount:1,loggedUnit:'g',FoodItem:{name:'Apple',brand:null}}],...overrides}
}
const rank=(rows,r=request,truncated=false)=>api.rankFoodHistory(rows,'u','America/New_York',r,truncated)
test('yesterday returns the original event and recorded quantities',()=>{
  const r=rank([message()]);assert.equal(r.disposition,'single_event');assert.equal(r.candidates[0].messageId,1)
  assert.equal(r.candidates[0].foods[0].grams,100);assert.equal(r.candidates[0].originalText,'smoothie with banana and protein')
})
test('multiple smoothies remain ambiguous; separate messages are never combined',()=>{
  const r=rank([message(),message(2)]);assert.equal(r.disposition,'ambiguous');assert.equal(r.candidates.length,2)
})
test('ownership, deletion, failure and incomplete meals are excluded defensively',()=>{
  const bad=[message(1,{userId:'other'}),message(2,{deletedAt:'2026-09-23'}),message(3,{status:'FAILED'}),
    message(4,{itemsToProcess:2}),message(5,{id:100}),message(6,{createdAt:'2026-09-24T00:00:00Z'})]
  for(const change of [{userId:'other'},{deletedAt:'2026-09-23'},{status:'Matching Failed'},{grams:0},{kcal:null}]) {
    const m=message(10);Object.assign(m.LoggedFoodItem[0],change);bad.push(m)
  }
  assert.equal(rank(bad).candidates.length,0)
})
test('calendar windows follow DST rather than subtracting 24 hours',()=>{
  const w=api.historyWindow({...request,referenceTime:'2026-03-09T12:00:00Z'},'America/New_York')
  assert.equal(w.start,'2026-03-08T05:00:00.000Z');assert.equal(w.end,'2026-03-09T04:00:00.000Z')
  assert.equal((Date.parse(w.end)-Date.parse(w.start))/3600000,23)
  assert.throws(()=>api.historyWindow(request,'invalid/timezone'),/timezone/)
})
test('yesterday boundaries use consumed time, including UTC timestamps without offsets',()=>{
  const r=rank([message(1,{consumedOn:'2026-09-22T03:59:59'}),message(2,{consumedOn:'2026-09-22T04:00:00'}),
    message(3,{consumedOn:'2026-09-23T04:00:00'})])
  assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].messageId,2)
})
test('usual breakfast needs a repeated complete pattern on at least three distinct days',()=>{
  const r={...request,text:'same bfast as usual'}
  const rows=[20,21,22].map((day,i)=>message(i+1,{content:'apple',consumedOn:`2026-09-${day}T13:00:00Z`,createdAt:`2026-09-${day}T13:00:00Z`}))
  assert.equal(rank(rows,r).disposition,'repeated_pattern')
  assert.equal(rank(rows.slice(0,2),r).disposition,'ambiguous')
  assert.equal(rank([message(1),message(2),message(3)],r).disposition,'ambiguous')
})
test('explicit brand overrides repeated history and food text must match',()=>{
  const m=message();m.LoggedFoodItem[0].FoodItem={name:'protein powder',brand:'Old Brand'}
  assert.equal(rank([m],{...request,text:'protein powder',explicitBrand:'New Brand'}).candidates.length,0)
  assert.equal(rank([m],{...request,text:'protein powder',explicitBrand:'Old Brand'}).disposition,'ranked_foods')
  assert.equal(rank([m],{...request,text:'cooked rice'}).candidates.length,0)
})
test('modifications and recipes are evidence only, never reconstructed',()=>{
  for(const text of ['same smoothie as yesterday without banana','my regular recipe']) {
    assert.equal(rank([message()],{...request,text}).disposition,'unsupported')
  }
})
test('a truncated scan cannot claim a unique reference',()=>{
  assert.equal(rank([message()],request,true).disposition,'ambiguous')
})
test('database lookup is read-only, owner scoped, bounded, excludes current/future records, and carries cancellation',async()=>{
  const calls=[];const q={then:(resolve)=>Promise.resolve({data:[message()],error:null}).then(resolve)}
  for(const method of ['select','eq','is','neq','gte','lt','lte','order','limit','abortSignal'])q[method]=(...args)=>{calls.push([method,...args]);return q}
  const signal=new AbortController().signal
  const search=api.createUserFoodHistorySearch({id:'u',tzIdentifier:'America/New_York'},{from:table=>{assert.equal(table,'Message');return q}})
  assert.equal((await search(request,signal)).disposition,'single_event')
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='userId'&&c[2]==='u'))
  assert.ok(calls.some(c=>c[0]==='neq'&&c[1]==='id'&&c[2]===100))
  assert.ok(calls.some(c=>c[0]==='limit'&&c[1]===101))
  assert.ok(calls.some(c=>c[0]==='abortSignal'&&c[1]===signal))
})
function shadowHarness(mode='shadow',globals={}) {
  const events=[]
  const shadow=load('foodResolution/history/shadow.ts',{
    '../telemetry':{currentFoodConfig:()=>({features:{history_search:mode}}),foodMetric:(...args)=>events.push(args)},
    './search':{createUserFoodHistorySearch(){throw Error('Unexpected default database')}}
  },globals).shadowFoodHistory
  return {events,shadow}
}
test('off mode makes no history reads; shadow makes no writes or result mutations',async()=>{
  let calls=0
  const search=()=>async()=>{calls++;return rank([message()])}
  const off=shadowHarness('off');await off.shadow({id:'u'},request,search);assert.equal(calls,0)
  const on=shadowHarness();assert.equal(await on.shadow({id:'u'},request,search),undefined)
  assert.equal(calls,1);assert.equal(on.events[0][0],'history_shadow')
  assert.doesNotMatch(JSON.stringify(on.events),/smoothie|banana|protein|originalText/)
})
test('shadow lookup errors never escape to meal processing',async()=>{
  const {shadow,events}=shadowHarness();await shadow({id:'u'},request,()=>async()=>{throw Error('private backend data')})
  assert.equal(events[0][2],'error');assert.doesNotMatch(JSON.stringify(events),/private backend/)
})
test('shadow has a hard deadline and aborts a hanging lookup',async()=>{
  let signal
  const {shadow,events}=shadowHarness('shadow',{setTimeout:fn=>setTimeout(fn,5)})
  await shadow({id:'u'},request,()=>async(r,s)=>{signal=s;return new Promise(()=>{})})
  assert.equal(signal.aborted,true);assert.equal(events[0][2],'error')
})

test('explicit dinner label cannot be treated as usual breakfast just because of its hour',()=>{
  assert.equal(rank([message(1,{content:'dinner apple'})],{...request,text:'usual breakfast'}).candidates.length,0)
})
test('search uses word boundaries instead of treating pineapple as apple',()=>{
  const m=message(1,{content:'pineapple'});m.LoggedFoodItem[0].FoodItem.name='Pineapple'
  assert.equal(rank([m],{...request,text:'apple'}).candidates.length,0)
})

test('a meal entered later is eligible when the edit supplies its knowledge cutoff',()=>{
  const row=message(1,{createdAt:'2026-09-23T16:00:00Z'});
  assert.equal(rank([row]).disposition,'none');
  assert.equal(rank([row],{...request,recordedBefore:'2026-09-23T17:00:00Z'}).disposition,'single_event');
});
