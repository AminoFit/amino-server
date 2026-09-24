const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript')
function load(file,stubs={}) {
  const module={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText,{module,exports:module.exports,performance,AbortSignal,require:n=>{if(n in stubs)return stubs[n];throw Error(`Unexpected import ${n}`)}})
  return module.exports
}
const nutrients=load('foodResolution/history/nutrients.ts')
function food(id=6,name='Apple') {
  return {id:10+id,userId:'u',deletedAt:null,status:'Processed',updatedAt:'2026-09-22T12:00:00',foodItemId:id,grams:100,kcal:54.945,
    proteinG:.3,carbG:14,totalFatG:.2,servingAmount:1,loggedUnit:'apple',FoodItem:{name,brand:null}}
}
function result(foods=[food()]) {return {disposition:'single_event',truncated:false,candidates:[{messageId:50,originalText:'Apple',consumedOn:'2026-09-22T12:00:00',foods}]}}
function harness({history=result(),mode='on',searchFails=false,insertFails=false,completeFails=false}={}) {
  const calls=[],inserted=[];let searches=0,updates=0
  const db={async rpc(name,args){calls.push({rpc:name,args});if(insertFails||completeFails)return {error:{code:'40001'}};inserted.push(...args.p_food_ids);return {data:{status:'RESOLVED'},error:null}},from(table){const filters=[];let update,insert
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
  const message={id:1,userId:'u',content:'same apple as yesterday',createdAt:'2026-09-23T12:00:00Z',consumedOn:'2026-09-23T12:00:00',resolvedAt:null,status:'RECEIVED',hasimages:false}
  return {api,db,calls,inserted,searches:()=>searches,message,run:(overrides={},editing=false)=>api.reuseFoodHistory({id:'u',tzIdentifier:'UTC'},
    {...message,...overrides},'2026-09-23T13:00:00Z',editing,db)}
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
test('successful reuse delegates the complete replacement to one owner-scoped transaction',async()=>{
  const h=harness();const response=await h.run()
  assert.equal(response.status,'RESOLVED');assert.equal(response.itemsProcessed,1)
  assert.equal(h.inserted.length,1);assert.equal(h.searches(),1)
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].rpc,'replace_food_from_history');
  assert.equal(h.calls[0].args.p_user_id,'u');assert.equal(h.calls[0].args.p_message_id,1);
  assert.equal(h.calls[0].args.p_source.foods[0].updatedAt,'2026-09-22T12:00:00');
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
test('transaction errors never retry an uncertain replacement',async()=>{
  for(const options of [{insertFails:true},{completeFails:true}]) {
    const h=harness(options);await assert.rejects(h.run())
    assert.equal(h.calls.filter(c=>c.rpc).length,1)
  }
})

test('same smoothie copies every ingredient in its unique original message',()=>{
  const {api}=harness();const history=result([food(6,'Protein Powder'),food(7,'Fruit Mixture, Frozen'),food(8,'milk'),food(9,'Chia Seeds')]);
  history.candidates[0].originalText='Smoothie with 1.5 scoop protein and frozen fruits with milk and chia seeds';
  const rows=api.historyCopies(history,'smoothie','u',1,'2026-09-23T13:00:00Z');
  assert.equal(rows.length,4);assert.deepEqual(Array.from(rows,r=>r.foodItemId),[6,7,8,9]);
});
test('editing a reference uses the same atomic replacement and does not delete first',async()=>{
  const h=harness();const r=await h.run({status:'RESOLVED',resolvedAt:'2026-09-23T12:00:00'},true);
  assert.equal(r.status,'RESOLVED');assert.equal(h.calls.length,1);assert.equal(h.calls[0].rpc,'replace_food_from_history');
  assert.equal(h.calls[0].args.p_expected.status,'RESOLVED');
});
test('an ambiguous or unavailable reference edit leaves existing foods and status untouched',async()=>{
  for(const options of [{history:{...result(),disposition:'ambiguous'}},{searchFails:true}]){
    const h=harness(options);const r=await h.run({status:'RESOLVED'},true);
    assert.equal(r.status,'FAILED');assert.equal(h.calls.length,0);assert.match(r.resultMessage,/kept/);
  }
});
