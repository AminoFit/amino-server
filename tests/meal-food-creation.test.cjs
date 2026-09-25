const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {createFoodSources}=require('../src/mealResolution/foodSources.ts');

const usdaFood={externalId:'2345',name:'Tuna Ceviche',brand:'Ocean Co',defaultServingWeightGram:140,weightUnknown:false,
  kcalPerServing:168,proteinPerServing:22,carbPerServing:8,totalFatPerServing:5,fiberPerServing:1,
  sugarPerServing:4,satFatPerServing:1,isLiquid:false,Serving:[{servingName:'cup',servingWeightGram:140}]};
const nearby=[{id:15293,name:'Tuna Ceviche',brand:null},{id:4439,name:'Ceviche',brand:null}];

function harness({jev,usda=[usdaFood],near=nearby,createRow={food_id:99001,created:true},web}={}){
  const calls={create:[],discovered:[],enqueued:[]};
  const db={rpc:(name,args)=>{
    const result=name==='search_usda_database'?{data:[{fdcId:2345}],error:null}:
      name==='get_cosine_results'?{data:near,error:null}:
      name==='create_catalogue_food'?(calls.create.push(args),{data:[createRow],error:null}):{data:null,error:{message:'x'}};
    return {abortSignal:()=>Promise.resolve(result)};
  }};
  const sources=createFoodSources({userId:'00000000-0000-4000-8000-000000000001',messageId:1,
    signal:new AbortController().signal,discover:id=>calls.discovered.push(id)},
    {db,embed:async (_model,texts)=>texts.map((text,i)=>({id:i+1,embedding:[0.1],text})),usda:async()=>usda,
      web:web??(async()=>({data:{foods:[]},sourceUrls:[],searches:1})),
      jev:async()=>jev,enqueue:async id=>calls.enqueued.push(id)});
  return {sources,calls};
}

test('an existing catalogue food chosen confidently is reused and nothing is created',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'food_15293',confidence:0.97}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  assert.deepEqual(await sources.createFoodFromSource(candidate.sourceId),{status:'existing',foodId:15293});
  assert.equal(calls.create.length,0);
  assert.deepEqual(calls.discovered,[15293]);
});

test('an uncertain or unavailable duplicate decision never creates a food',async()=>{
  for (const jev of [{status:'ok',choice:'none',confidence:0.8},{status:'ok',choice:'food_15293',confidence:0.6},
    {status:'unavailable'},{status:'invalid_response'}]) {
    const {sources,calls}=harness({jev});
    const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
    const result=await sources.createFoodFromSource(candidate.sourceId);
    assert.equal(result.status,'possible_duplicates');
    assert.equal(calls.create.length,0,JSON.stringify(jev));
    assert.deepEqual(calls.discovered,[15293,4439]);
  }
});

test('a confident "none" creates once through the atomic function with USDA provenance',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'none',confidence:0.95}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  assert.deepEqual(await sources.createFoodFromSource(candidate.sourceId),{status:'created',foodId:99001});
  assert.equal(calls.create.length,1);
  const food=calls.create[0].p_food;
  assert.equal(food.foodInfoSource,'USDA');assert.equal(food.externalId,'2345');
  assert.equal(food.kcal,168);assert.equal(food.defaultServingWeightGram,140);
  assert.deepEqual(calls.enqueued,[99001]);
});

test('the database identity guard can still return an existing food after the semantic check',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'none',confidence:0.95},createRow:{food_id:15293,created:false}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  assert.deepEqual(await sources.createFoodFromSource(candidate.sourceId),{status:'existing',foodId:15293});
  assert.deepEqual(calls.enqueued,[]);
});

test('only server-held source candidates can be created, so a model cannot invent nutrition',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'none',confidence:0.99}});
  await assert.rejects(sources.createFoodFromSource('usda:2345'),/unknown_food_source/);
  assert.equal(calls.create.length,0);
});

test('web facts need a citation the search actually returned',async()=>{
  const web=async()=>({data:{foods:[
    {name:'Cafe Bowl',brand:'Cafe',servingName:'bowl',servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,sourceUrl:'https://cafe.example/menu'},
    {name:'Other Bowl',brand:'Cafe',servingName:'bowl',servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,sourceUrl:'https://invented.example/x'}]},
    sourceUrls:['https://cafe.example/menu'],searches:1});
  const {sources}=harness({usda:[],web,jev:{status:'ok',choice:'none',confidence:0.95}});
  const {candidates}=await sources.searchFoodSources('cafe bowl');
  assert.deepEqual(candidates.map(c=>c.name),['Cafe Bowl']);
  assert.equal(candidates[0].source,'https://cafe.example/menu');
});

test('implausible source nutrition is discarded before it can become a food',async()=>{
  const {sources}=harness({usda:[{...usdaFood,kcalPerServing:5000}],jev:{status:'ok',choice:'none',confidence:0.95}});
  assert.equal((await sources.searchFoodSources('tuna ceviche')).status,'empty');
});

test('estimated foods are a marked last resort that still pass the same duplicate guard',async()=>{
  const {sources,calls}=harness({near:[],jev:{status:'unavailable'}});
  const estimate=sources.proposeEstimatedFood({name:"Grandma's lasagna",brand:null,
    per100g:{kcal:160,proteinG:9,carbG:14,totalFatG:7},servings:[{name:'slice',grams:250}],
    basis:'Beef, pasta, ricotta and tomato sauce in typical home-recipe proportions'});
  assert.equal(estimate.kind,'AgentEstimate');
  assert.equal((await sources.createFoodFromSource(estimate.sourceId)).status,'created');
  assert.equal(calls.create[0].p_food.foodInfoSource,'AgentEstimate');
  assert.match(calls.create[0].p_food.source,/^Estimate: /);
  assert.throws(()=>sources.proposeEstimatedFood({name:'x',brand:null,per100g:{kcal:1,proteinG:0,carbG:0,totalFatG:0},servings:[],basis:'short'}));
});
