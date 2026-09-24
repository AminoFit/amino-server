const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript')
function load(file,stubs={}) {
  const module={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText,{module,exports:module.exports,performance,require:n=>{if(n in stubs)return stubs[n];throw Error(`Unexpected import ${n}`)}})
  return module.exports
}
const nutrients=load('foodResolution/history/nutrients.ts')
function food(id=6,name='Apple') {
  return {id:10+id,userId:'u',deletedAt:null,status:'Processed',foodItemId:id,grams:100,kcal:54.945,
    proteinG:.3,carbG:14,totalFatG:.2,servingAmount:1,loggedUnit:'apple',FoodItem:{name,brand:null}}
}
function result(foods=[food()]) {return {disposition:'single_event',truncated:false,candidates:[{messageId:50,foods}]}}
function harness({history=result(),mode='on',searchFails=false,insertFails=false,completeFails=false}={}) {
  const calls=[],inserted=[];let searches=0,updates=0
  const db={from(table){const filters=[];let update,insert
    const q={update(data){update=data;return q},insert(rows){insert=rows;return q},eq(k,v){filters.push([k,v]);return q},
      is(k,v){filters.push([k,v]);return q},select(){return q},maybeSingle(){return run()},then(y,n){return run().then(y,n)}}
    async function run(){
      calls.push({table,filters,update,insert})
      if(insert){if(insertFails)return {data:null,error:{code:'network'}};inserted.push(...insert);return {data:insert.map((_,i)=>({id:100+i})),error:null}}
      updates++;return {data:completeFails&&updates===2?null:{id:1},error:completeFails&&updates===2?{code:'network'}:null}
    }return q
  }}
  const api=load('foodResolution/history/reuse.ts',{
    './nutrients':nutrients,'@/utils/supabase/serverAdmin':{createAdminSupabase:()=>db},
    '../telemetry':{currentFoodConfig:()=>({features:{history_reuse:mode}}),foodMetric(){}},
    './search':{createUserFoodHistorySearch:()=>async()=>{searches++;if(searchFails)throw Error('timeout');return history}}
  })
  const message={id:1,userId:'u',content:'same apple as yesterday',createdAt:'2026-09-23T12:00:00Z',hasimages:false}
  return {api,db,calls,inserted,searches:()=>searches,message,run:(overrides={})=>api.reuseFoodHistory({id:'u',tzIdentifier:'UTC'},
    {...message,...overrides},'2026-09-23T13:00:00Z',false,db)}
}
test('clear reference copies original grams, nutrition and provenance into today, not catalogue defaults',()=>{
  const {api}=harness();const rows=api.historyCopies(result(),'apple','u',1,'2026-09-23T13:00:00Z')
  assert.equal(rows.length,1);assert.equal(rows[0].grams,100);assert.equal(rows[0].kcal,54.945)
  assert.equal(rows[0].proteinG,.3);assert.equal(rows[0].vitaminCMg,null)
  assert.equal(rows[0].consumedOn,'2026-09-23T13:00:00Z');assert.equal(rows[0].servingAmount,100)
  assert.equal(rows[0].extendedOpenAiData.historySourceMessageId,50)
  assert.equal(rows[0].id,undefined)
})
test('a food reference selects that food, not every food in the historical meal',()=>{
  const {api}=harness();const history=result([food(),food(7,'Egg')])
  assert.equal(api.historyCopies(history,'apple','u',1,'2026-09-23').length,1)
  assert.equal(api.historyCopies(history,'breakfast','u',1,'2026-09-23').length,2)
  assert.equal(api.historyCopies(history,'smoothie','u',1,'2026-09-23'),null)
})
test('ambiguous, truncated, unsupported and inferred patterns cannot be auto-saved',()=>{
  const {api}=harness()
  for(const disposition of ['ambiguous','unsupported','repeated_pattern','ranked_foods','none']) {
    assert.equal(api.historyCopies({...result(),disposition},'apple','u',1,'2026-09-23'),null)
  }
  assert.equal(api.historyCopies({...result(),truncated:true},'apple','u',1,'2026-09-23'),null)
})
test('deleted, foreign-owned and invalid nutrition snapshots are refused',()=>{
  const {api}=harness()
  for(const change of [{userId:'other'},{deletedAt:'2026-09-23'},{grams:0},{kcal:NaN},{proteinG:-1}]) {
    assert.equal(api.historyCopies(result([{...food(),...change}]),'apple','u',1,'2026-09-23'),null)
  }
})
test('changed amounts, substitutions and compound requests cannot silently reuse old quantities',()=>{
  const {api}=harness()
  for(const text of ['same 200 g apple as yesterday','same large apple as yesterday','same apple as yesterday without skin',
    'same apple and eggs as yesterday','same apple as yesterday and a banana','same breakfast as usual','my usual breakfast']) {
    assert.equal(api.isHistoryReference(text),true);assert.equal(api.referenceTarget(text),null)
  }
  assert.equal(api.referenceTarget('same apple as yesterday'),'apple')
  assert.equal(api.referenceTarget('same apple from yesterday'),'apple')
})
test('successful reuse uses one bulk insert and owner-scoped lifecycle updates',async()=>{
  const h=harness();const response=await h.run()
  assert.equal(response.status,'RESOLVED');assert.equal(response.itemsProcessed,1)
  assert.equal(h.inserted.length,1);assert.equal(h.searches(),1)
  for(const call of h.calls.filter(c=>c.table==='Message')) {
    assert.ok(call.filters.some(([k,v])=>k==='userId'&&v==='u'))
    assert.ok(call.filters.some(([k,v])=>k==='id'&&v===1))
    assert.ok(call.filters.some(([k,v])=>k==='deletedAt'&&v===null))
  }
})
test('ambiguous history and unavailable lookup return existing FAILED contract without food writes',async()=>{
  for(const options of [{history:{...result(),disposition:'ambiguous'}},{searchFails:true}]) {
    const h=harness(options);assert.equal((await h.run()).status,'FAILED');assert.equal(h.inserted.length,0)
  }
})
test('switch off and ordinary input retain legacy processing without history queries',async()=>{
  const off=harness({mode:'off'});assert.equal(await off.run(),null);assert.equal(off.calls.length,0)
  const normal=harness();assert.equal(await normal.run({content:'100 g apple'}),null);assert.equal(normal.searches(),0)
})
test('insertion or final-progress errors never retry the bulk insert',async()=>{
  for(const options of [{insertFails:true},{completeFails:true}]) {
    const h=harness(options);await assert.rejects(h.run())
    assert.equal(h.calls.filter(c=>c.insert).length,1)
  }
})
