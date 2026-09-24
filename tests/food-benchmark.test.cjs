const {test}=require('node:test'),assert=require('node:assert/strict')
const b=require('../scripts/food-agent/benchmark.cjs'),{cases}=require('../scripts/food-agent/benchmark-fixtures.cjs'),r=require('../scripts/food-agent/benchmark-runtime.cjs')
test('handwritten match labels have supported grams and calories',()=>{
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length)
 for(const c of cases.filter(c=>c.expected)){
  const t=b.task(c,3),proposals=Object.values(t.mapping).filter(Boolean)
  assert.ok(proposals.some(p=>{const res=r.validate({decision:'match',...p},c.item,new Map(c.foods.map(f=>[f.id,f])));return b.score(c,{status:'matched',resolution:res}).correct}),c.id)
 }
})
test('prompt construction excludes labels, group and case identity',()=>{
 for(const c of cases){const t=b.task({...c,expected:{secret_truth:'SENTINEL'},id:'SENTINEL',group:'SENTINEL'},7)
 for(const v of b.variants.filter(v=>['chat','jev'].includes(v.kind)))assert.ok(!JSON.stringify(b.payload(t,v)).includes('SENTINEL'))}
})
test('shuffling changes positions without changing candidate/serving mappings',()=>{
 const c=cases[2],a=b.task(c,1),z=b.task(c,97)
 const canon=t=>Object.values(t.mapping).filter(Boolean).map(x=>JSON.stringify(x)).sort()
 assert.deepEqual(canon(a),canon(z));assert.ok(Array.from({length:10},(_,i)=>b.task(c,i)).some(t=>JSON.stringify(t.mapping)!==JSON.stringify(a.mapping)))
 assert.deepEqual(b.materialize(c,3),b.materialize(c,3))
})
test('invalid choice and truncated structured output are failures',()=>{
 const t=b.task(cases[0],4)
 assert.throws(()=>b.parse({answers:{selection:{choice:'not-an-option'}}},t,'jev'),/invalid_choice/)
 assert.throws(()=>b.parse({choices:[{finish_reason:'length',message:{content:'{"choice":"none"}'}}]},t,'chat'),/invalid_finish/)
 assert.equal(b.parse({answers:{selection:{choice:'none',confidence:.98}}},t,'jev').confidence,.98)
})
test('a timeout or rejected proposal never scores as correct abstention',()=>{
 const c=cases.find(c=>!c.expected)
 for(const status of ['deadline','invalid_proposal','provider_failure','error'])assert.equal(b.score(c,{status}).correct,false)
 assert.equal(b.score(c,{status:'unmatched'}).correct,true)
 assert.equal(b.score(c,{status:'external_required'}).correct,true)
})
test('validator acceptance is distinct from semantic correctness',()=>{
 const c=cases[0],resolution=r.validate({decision:'match',foodId:13,servingId:null},c.item,new Map(c.foods.map(f=>[f.id,f])))
 assert.ok(resolution);assert.equal(b.score(c,{status:'matched',resolution}).wrongAccepted,true)
})
test('standard exact grams path uses actual code and makes no model call',async()=>{
 const c=cases.find(c=>c.id==='exact_apple_mass')
 const result=await r.standard(c,{model:'google/gemini-3.8-flash',signal:new AbortController().signal,request:()=>{throw Error('No model expected')}})
 assert.equal(result.pathway,'exact');assert.equal(b.score(c,result).correct,true)
})
test('standard semantic plus household serving path uses two Flash calls and no stores',async()=>{
 const c=cases.find(c=>c.id==='rice_cup'),sent=[]
 const result=await r.standard(c,{model:'google/gemini-3.8-flash',signal:new AbortController().signal,request:async(kind,body)=>{
  sent.push(body);const out=sent.length===1?{choice:'candidate_2',alternative:null}:
   {equation_grams:'158',amount:1,serving_name:'cup',full_serving_string:'one cup',matching_serving_id:1}
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]}
 }})
 assert.equal(sent.length,2);assert.match(sent[0].messages[1].content,/candidate_1/)
 assert.match(sent[1].messages[1].content,/<food_serving_info>/);assert.equal(sent[0].max_tokens,500)
 assert.equal(b.score(c,result).correct,true)
})
test('standard external fallback is reported without importing food',async()=>{
 const result=await r.standard(cases[0],{model:'google/gemini-3.8-flash',signal:new AbortController().signal,
 request:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({choice:'none',alternative:null})}}]})})
 assert.equal(result.status,'external_required')
})
test('prefilter removes invalid options without using labels or hiding good answers',()=>{
 for(const c of cases){const original=b.task(c,7),filtered=b.filterTask(original)
  if(c.expected)assert.ok(Object.values(filtered.mapping).some(p=>p&&p.foodId===c.expected.foodId),c.id)
  for(const [key,p] of Object.entries(filtered.mapping)){assert.deepEqual(p,original.mapping[key]);if(p)assert.ok(r.validate({decision:'match',...p},c.item,new Map(c.foods.map(f=>[f.id,f]))))}
  if(c.id==='missing_nutrition'||c.id==='impossible_nutrition')assert.equal(filtered.state.foods.length,0)
 }
})
test('empty filtered evidence makes no model call',async()=>{
 const previous=global.fetch;let calls=0
 global.fetch=async()=>{calls++;throw Error('Network forbidden in this test')}
 try {const c=cases.find(c=>c.id==='missing_nutrition'),result=await b.run(c,b.variants.find(v=>v.id==='jev-filtered'),2,'test-key')
 assert.equal(calls,0);assert.equal(result.pathway,'deterministic_abstention');assert.equal(result.correct,true)}finally{global.fetch=previous}
})
test('a sole nutritionally valid candidate still requires semantic selection',async()=>{
 const source=cases.find(c=>c.id==='absent_food'),c={...source,item:{...source.item,food_database_search_name:'apple',full_item_user_message_including_serving:'100 g apple'},foods:[source.foods[0]]}
 const filtered=b.filterTask(b.task(c,1));assert.equal(Object.keys(filtered.mapping).length,2)
 const previous=global.fetch;let calls=0
 global.fetch=async()=>{calls++;return Response.json({answers:{selection:{choice:'none',confidence:.99}},usage:{cost:.00001}})}
 try {const result=await b.run(c,b.variants.find(v=>v.id==='jev-filtered'),1,'test-key');assert.equal(calls,1);assert.equal(result.status,'unmatched');assert.equal(result.correct,true)}finally{global.fetch=previous}
})
test('cascade calls Gemini only after an uncertain Jev decision and uses total measured requests',async()=>{
 const c=cases[0],seed=7,t=b.filterTask(b.task(c,seed)),choice=Object.entries(t.mapping).find(([,p])=>p&&p.foodId===11&&p.servingId===null)[0]
 const previous=global.fetch;let calls=0
 global.fetch=async()=>{calls++;return Response.json(calls===1?{answers:{selection:{choice:'none',confidence:.01}},usage:{cost:.00001}}:
  {choices:[{finish_reason:'stop',message:{content:JSON.stringify({choice})}}],usage:{cost:.0001}})}
 try {const result=await b.run(c,b.variants.find(v=>v.id==='jev-gemini-cascade'),seed,'test-key')
  assert.equal(calls,2);assert.equal(result.usedFallback,true);assert.equal(result.firstConfidence,.01);assert.equal(result.correct,true);assert.equal(result.calls.length,2)
 }finally{global.fetch=previous}
})
