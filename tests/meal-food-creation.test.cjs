const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {createFoodSources}=require('../src/mealResolution/foodSources.ts');

const usdaFood={externalId:'2345',name:'Tuna Ceviche',brand:'Ocean Co',defaultServingWeightGram:140,weightUnknown:false,
  kcalPerServing:168,proteinPerServing:22,carbPerServing:8,totalFatPerServing:5,fiberPerServing:1,
  sugarPerServing:4,satFatPerServing:1,isLiquid:false,Serving:[{servingName:'cup',servingWeightGram:140}]};
const nearby=[{id:15293,name:'Tuna Ceviche',brand:null},{id:4439,name:'Ceviche',brand:null}];

function harness({jev,usda=[usdaFood],near=nearby,createRow={food_id:99001,created:true,enrichment:null},web,usdaSearch,barcodes=[]}={}){
  const calls={create:[],enrich:[],discovered:[],enqueued:[],web:[]};
  const db={rpc:(name,args)=>{
    const result=name==='search_usda_database'?{data:[{fdcId:2345}],error:null}:
      name==='get_cosine_results'?{data:near,error:null}:
      name==='create_catalogue_food'?(calls.create.push(args),{data:[createRow],error:null}):
      name==='enrich_catalogue_food'?(calls.enrich.push(args),{data:{foodId:args.p_food_id,added:['serving:cup'],conflict:false},error:null}):
      {data:null,error:{message:'x'}};
    return {abortSignal:()=>Promise.resolve(result)};
  }};
  const sources=createFoodSources({userId:'00000000-0000-4000-8000-000000000001',messageId:1,barcodes,
    signal:new AbortController().signal,discover:id=>calls.discovered.push(id)},
    {db,embed:async (_model,texts)=>texts.map((text,i)=>({id:i+1,embedding:[0.1],text})),usda:async()=>usda,
      usdaSearch:usdaSearch??(async()=>[]),model:'anthropic/claude-sonnet-5',
      web:async(...args)=>{calls.web.push(args);return (web??(async()=>({data:{foods:[]},sourceUrls:[],searches:1})))(...args)},
      jev:async()=>jev,enqueue:async id=>calls.enqueued.push(id)});
  return {sources,calls};
}

test('an existing catalogue food chosen confidently is reused and nothing is created',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'food_15293',confidence:0.97}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  const result=await sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([result.status,result.foodId],['existing',15293]);
  assert.equal(calls.create.length,0);
  assert.deepEqual(calls.discovered,[15293]);
  assert.equal(calls.enrich.length,1,'the existing food is enriched with what the source adds');
  assert.equal(calls.enrich[0].p_food_id,15293);
  assert.deepEqual(result.enrichment.added,['serving:cup']);
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
  assert.deepEqual(await sources.createFoodFromSource(candidate.sourceId),{status:'created',foodId:99001,enrichment:null});
  assert.equal(calls.create.length,1);
  const food=calls.create[0].p_food;
  assert.equal(food.foodInfoSource,'USDA');assert.equal(food.externalId,'2345');
  assert.equal(food.kcal,168);assert.equal(food.defaultServingWeightGram,140);
  assert.deepEqual(calls.enqueued,[99001]);
});

test('the database identity guard can still return an existing food after the semantic check',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'none',confidence:0.95},
    createRow:{food_id:15293,created:false,enrichment:{added:['gtin'],conflict:false}}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  assert.deepEqual(await sources.createFoodFromSource(candidate.sourceId),{status:'existing',foodId:15293,enrichment:{added:['gtin'],conflict:false}});
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

const cheerios={externalId:'2745373',name:'Cheerios Protein Cookies & Creme',brand:'General Mills',defaultServingWeightGram:37,
  weightUnknown:false,kcalPerServing:150,proteinPerServing:8,carbPerServing:24,totalFatPerServing:2.5,fiberPerServing:2,
  sugarPerServing:11,satFatPerServing:0,isLiquid:false,Serving:[{servingName:'cup',servingWeightGram:37}]};

test('a decoded barcode finds the USDA record with that exact GTIN, never the first text hit',async()=>{
  const searched=[];
  const {sources}=harness({usda:[cheerios],barcodes:['00016000229969'],
    usdaSearch:async query=>{searched.push(query);return [{fdcId:1,gtinUpc:'016000229962'},{fdcId:2745373,gtinUpc:'016000229969'}]}});
  const {candidates}=await sources.searchFoodSources('Cheerios Protein Cookies & Creme',{gtin:'016000229969'});
  assert.deepEqual(searched,['016000229969']);
  assert.equal(candidates[0].gtin,'00016000229969');
  assert.equal(candidates[0].kind,'USDA');
});

test('a barcode the library did not decode from this meal is ignored',async()=>{
  const searched=[];
  const {sources}=harness({usda:[],barcodes:[],usdaSearch:async q=>{searched.push(q);return []}});
  await sources.searchFoodSources('cereal',{gtin:'016000229969'});
  assert.deepEqual(searched,[],'a model-supplied barcode is not trusted');
  const label=sources.proposeLabelFood({name:'Cereal',brand:null,servingName:'cup',servingGrams:37,kcal:150,proteinG:8,carbG:24,
    totalFatG:2.5,fiberG:null,sugarG:null,satFatG:null,gtin:'016000229969'});
  assert.equal(label.gtin,null);
});

test('the label is always offered, and web results say whether they match it',async()=>{
  const web=async()=>({data:{foods:[
    {name:'Cheerios Protein Cookies & Creme',brand:'General Mills',servingName:'cup',servingGrams:37,kcal:150,proteinG:8,carbG:24,totalFatG:2.5,sourceUrl:'https://cheerios.example/protein'},
    {name:'Cheerios Protein Oats & Honey',brand:'General Mills',servingName:'cup',servingGrams:55,kcal:210,proteinG:11,carbG:44,totalFatG:3,sourceUrl:'https://cheerios.example/oats'}]},
    sourceUrls:['https://cheerios.example/protein','https://cheerios.example/oats'],searches:1});
  const {sources,calls}=harness({usda:[],web,barcodes:['00016000229969']});
  const label=sources.proposeLabelFood({name:'Cheerios Protein Cookies & Creme',brand:'Cheerios',servingName:'1 cup',servingGrams:37,
    kcal:150,proteinG:8,carbG:24,totalFatG:2.5,fiberG:2,sugarG:11,satFatG:0,gtin:'016000229969'});
  assert.equal(label.kind,'Label');
  assert.equal(label.gtin,'00016000229969');
  const {candidates}=await sources.searchFoodSources('Cheerios Protein Cookies & Creme',{labelSourceId:label.sourceId});
  assert.deepEqual(candidates.map(c=>[c.name,c.matchesLabel]),[
    ['Cheerios Protein Cookies & Creme',true],['Cheerios Protein Oats & Honey',false],['Cheerios Protein Cookies & Creme',undefined]]);
  assert.equal(calls.web[0][3].model,'anthropic/claude-sonnet-5','web extraction uses the creation model');
});

test('web search retries once when the first pass abstains',async()=>{
  let attempts=0;
  const web=async()=>{attempts++;return attempts===1?{data:{foods:[]},sourceUrls:[],searches:1}:
    {data:{foods:[{name:'Cafe Bowl',brand:'Cafe',servingName:'bowl',servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,
      sourceUrl:'https://cafe.example/menu'}]},sourceUrls:['https://cafe.example/menu'],searches:1}};
  const {sources}=harness({usda:[],web});
  assert.equal((await sources.searchFoodSources('cafe bowl')).candidates.length,1);
  assert.equal(attempts,2);
});

test('name-search neighbours never suppress the web search when the barcode has no exact record',async()=>{
  const web=async()=>({data:{foods:[{name:'Cheerios Protein Cookies & Creme',brand:'General Mills',servingName:'cup',servingGrams:37,
    kcal:150,proteinG:8,carbG:24,totalFatG:2.5,sourceUrl:'https://cheerios.example/protein'}]},sourceUrls:['https://cheerios.example/protein'],searches:1});
  const {sources,calls}=harness({usda:[usdaFood],web,barcodes:['00016000229969'],usdaSearch:async()=>[]});
  const {candidates}=await sources.searchFoodSources('Cheerios Protein Cookies & Creme',{gtin:'00016000229969'});
  assert.equal(calls.web.length,1);
  assert.deepEqual(candidates.map(c=>c.kind),['Online','USDA']);
  assert.equal(candidates[0].gtin,'00016000229969');
});
