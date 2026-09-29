const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {createFoodSources}=require('../src/mealResolution/foodSources.ts');

const usdaFood={externalId:'2345',name:'Tuna Ceviche',brand:'Ocean Co',defaultServingWeightGram:140,weightUnknown:false,
  kcalPerServing:168,proteinPerServing:22,carbPerServing:8,totalFatPerServing:5,fiberPerServing:1,
  sugarPerServing:4,satFatPerServing:1,isLiquid:false,Serving:[{servingName:'cup',servingWeightGram:140}]};
const nearby=[{id:15293,name:'Tuna Ceviche',brand:null},{id:4439,name:'Ceviche',brand:null}];

function harness({enrichConflict=false,jev=null,usda=[usdaFood],near=nearby,catalogue=null,byName=null,createRow={food_id:99001,created:true,enrichment:null},web,usdaSearch,barcodes=[]}={}){
  const calls={create:[],enrich:[],supersede:[],discovered:[],enqueued:[],web:[],jev:[],rpc:[],visibility:[]};
  const facts=(catalogue??near).map(f=>({gtin:null,defaultServingWeightGram:100,kcalPerServing:120,proteinPerServing:20,Serving:[],...f}));
  const db={from:()=>{let column=null,value=null;const q={select:()=>q,in:()=>q,limit:()=>q,or:filter=>{calls.visibility.push(filter);return q},is:()=>q,eq:(c,v)=>{column=c;value=v;return q},
    abortSignal:async()=>({data:column?facts.filter(f=>f[column]===value):facts,error:null})};return q},
    rpc:(name,args)=>{
    calls.rpc.push([name,args]);
    const result=name==='search_usda_database'?{data:[{fdcId:2345}],error:null}:
      name==='search_meal_food_catalogue'&&byName?{data:byName,error:null}:
      name==='get_cosine_results'?{data:near,error:null}:
      name==='create_catalogue_food'?(calls.create.push(args),{data:[createRow],error:null}):
      name==='supersede_catalogue_estimate'?(calls.supersede.push(args),{data:{foodId:args.p_food_id,superseded:true,enrichment:null},error:null}):
      name==='enrich_catalogue_food'?(calls.enrich.push(args),{data:{foodId:args.p_food_id,added:enrichConflict?[]:['serving:cup'],conflict:enrichConflict},error:null}):
      {data:null,error:{message:'x'}};
    return {abortSignal:()=>Promise.resolve(result)};
  }};
  const sources=createFoodSources({userId:'00000000-0000-4000-8000-000000000001',messageId:1,barcodes,
    signal:new AbortController().signal,discover:id=>calls.discovered.push(id)},
    {db,embed:async (_model,texts)=>texts.map((text,i)=>({id:i+1,embedding:[0.1],text})),usda:async()=>usda,
      usdaSearch:usdaSearch??(async()=>[]),model:'anthropic/claude-sonnet-5',
      web:async(...args)=>{calls.web.push(args);return (web??(async()=>({data:{foods:[]},sourceUrls:[],searches:1})))(...args)},
      jev:async task=>{calls.jev.push(task);return typeof jev==='function'?jev(task):jev},enqueue:async id=>calls.enqueued.push(id)});
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
    {name:'Cafe Bowl',brand:'Cafe',servingUnit:'bowl',servingAmount:1,servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,sourceUrl:'https://cafe.example/menu'},
    {name:'Other Bowl',brand:'Cafe',servingUnit:'bowl',servingAmount:1,servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,sourceUrl:'https://invented.example/x'}]},
    sourceUrls:['https://cafe.example/menu'],searches:1});
  const {sources,calls}=harness({usda:[],web,jev:{status:'ok',choice:'none',confidence:0.95}});
  const {candidates}=await sources.searchFoodSources('cafe bowl',{web:true});
  assert.deepEqual(candidates.map(c=>c.name),['Cafe Bowl']);
  assert.equal(candidates[0].source,'https://cafe.example/menu');
  assert.equal(calls.web[0][3].model,'anthropic/claude-sonnet-5','web extraction uses the creation model');
});

test('implausible source nutrition is discarded before it can become a food',async()=>{
  const {sources}=harness({usda:[{...usdaFood,kcalPerServing:5000}],jev:{status:'ok',choice:'none',confidence:0.95}});
  assert.equal((await sources.searchFoodSources('tuna ceviche')).status,'empty');
});

test('estimated foods are a marked last resort that still pass the same duplicate guard',async()=>{
  const {sources,calls}=harness({near:[],jev:{status:'unavailable'}});
  const estimate=sources.proposeEstimatedFood({name:"Grandma's lasagna",brand:null,
    per100g:{kcal:160,proteinG:9,carbG:14,totalFatG:7},servings:[{unit:'slice',amount:1,grams:250}],
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
  const label=sources.proposeLabelFood({name:'Cereal',brand:null,servingUnit:'cup',servingAmount:1,servingGrams:37,kcal:150,proteinG:8,carbG:24,
    totalFatG:2.5,fiberG:null,sugarG:null,satFatG:null,gtin:'016000229969',identified:true});
  assert.equal(label.gtin,null);
});

test('a label is a complete source: it is offered without any web search, and USDA records say whether they match it',async()=>{
  const {sources,calls}=harness({usda:[],barcodes:['00016000229969']});
  const label=sources.proposeLabelFood({name:'Cheerios Protein Cookies & Creme',brand:'Cheerios',servingUnit:'cup',servingAmount:1,servingGrams:37,
    kcal:150,proteinG:8,carbG:24,totalFatG:2.5,fiberG:2,sugarG:11,satFatG:0,gtin:'016000229969',identified:true});
  assert.equal(label.kind,'Label');
  assert.equal(label.gtin,'00016000229969');
  const {candidates}=await sources.searchFoodSources('Cheerios Protein Cookies & Creme',{labelSourceId:label.sourceId,web:true});
  assert.deepEqual(candidates.map(c=>c.kind),['Label']);
  assert.equal(calls.web.length,0,'never search the web for a product whose label is in the photo');
  const withUsda=harness({usda:[cheerios,{...cheerios,externalId:'9',name:'Cheerios Protein Oats & Honey',defaultServingWeightGram:55,kcalPerServing:210}],
    barcodes:['00016000229969'],usdaSearch:async()=>[{fdcId:2745373,gtinUpc:'016000229969'}]});
  const own=withUsda.sources.proposeLabelFood({name:'Cheerios Protein Cookies & Creme',brand:'Cheerios',servingUnit:'cup',servingAmount:1,servingGrams:37,
    kcal:150,proteinG:8,carbG:24,totalFatG:2.5,fiberG:2,sugarG:11,satFatG:0,gtin:'016000229969',identified:true});
  const matched=await withUsda.sources.searchFoodSources('Cheerios',{gtin:'016000229969',labelSourceId:own.sourceId});
  assert.deepEqual(matched.candidates.map(c=>[c.kind,c.matchesLabel]),[['USDA',true],['USDA',false],['Label',undefined]]);
});

test('without a barcode, sources come from USDA by name; the web only when asked for',async()=>{
  const {sources,calls}=harness({});
  const {candidates}=await sources.searchFoodSources('tuna ceviche');
  assert.deepEqual(candidates.map(c=>c.kind),['USDA']);
  assert.equal(calls.web.length,0);
  await sources.searchFoodSources('tuna ceviche',{web:true});
  assert.ok(calls.web.length>0);
});

test('web search retries once when the first pass abstains',async()=>{
  let attempts=0;
  const web=async()=>{attempts++;return attempts===1?{data:{foods:[]},sourceUrls:[],searches:1}:
    {data:{foods:[{name:'Cafe Bowl',brand:'Cafe',servingUnit:'bowl',servingAmount:1,servingGrams:300,kcal:450,proteinG:30,carbG:40,totalFatG:18,
      sourceUrl:'https://cafe.example/menu'}]},sourceUrls:['https://cafe.example/menu'],searches:1}};
  const {sources}=harness({usda:[],web});
  assert.equal((await sources.searchFoodSources('cafe bowl',{web:true})).candidates.length,1);
  assert.equal(attempts,2);
});

test('a decoded barcode that neither the catalogue nor USDA knows, with no label, goes to the web',async()=>{
  const web=async()=>({data:{foods:[{name:'Cheerios Protein Cookies & Creme',brand:'General Mills',servingUnit:'cup',servingAmount:1,servingGrams:37,
    kcal:150,proteinG:8,carbG:24,totalFatG:2.5,sourceUrl:'https://cheerios.example/protein'}]},sourceUrls:['https://cheerios.example/protein'],searches:1});
  const {sources,calls}=harness({usda:[usdaFood],web,barcodes:['00016000229969'],usdaSearch:async()=>[]});
  const {candidates}=await sources.searchFoodSources('Cheerios Protein Cookies & Creme',{gtin:'00016000229969'});
  assert.equal(calls.web.length,1);
  assert.deepEqual(candidates.map(c=>c.kind),['Online'],'name-search neighbours are not the scanned product');
  assert.equal(candidates[0].gtin,'00016000229969');
});

test('servings keep the unit separate from its amount, so the app never shows "1 1 cup (37g)"',async()=>{
  const web=async()=>({data:{foods:[{name:'Protein Drink',brand:'Chobani',servingUnit:'bottle',servingAmount:1,servingGrams:207,
    kcal:110,proteinG:15,carbG:8,totalFatG:2,sourceUrl:'https://chobani.example/drink'}]},sourceUrls:['https://chobani.example/drink'],searches:1});
  const {sources,calls}=harness({usda:[],web,jev:{status:'ok',choice:'none',confidence:0.95}});
  const [candidate]=(await sources.searchFoodSources('Chobani protein drink',{web:true})).candidates;
  assert.deepEqual(candidate.servings,[{name:'bottle',grams:207,amount:1}]);
  await sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual(calls.create[0].p_servings,[{name:'bottle',grams:207,amount:1}]);
});

test('a per-100 mL label basis is not stored as a serving',()=>{
  const {sources}=harness({});
  const label=sources.proposeLabelFood({name:'Leche Ultrafiltrada',brand:'Lala',servingUnit:'ml',servingAmount:100,servingGrams:100,
    kcal:44,proteinG:5.4,carbG:3.5,totalFatG:1,fiberG:null,sugarG:null,satFatG:null,gtin:null,identified:true});
  assert.deepEqual(label.servings,[]);
  const bottle=sources.proposeLabelFood({name:'Protein Drink',brand:'Chobani',servingUnit:'bottle',servingAmount:1,servingGrams:207,
    kcal:120,proteinG:15,carbG:9,totalFatG:2,fiberG:null,sugarG:null,satFatG:null,gtin:null,identified:true});
  assert.deepEqual(bottle.servings,[{name:'bottle',grams:207,amount:1}]);
});

test('barcodes decide duplicates outright, and Jev sees the facts that separate sibling products',async()=>{
  const drink={name:'Chobani Protein Drink Tropical Punch',brand:'Chobani',servingUnit:'bottle',servingAmount:1,servingGrams:207,
    kcal:120,proteinG:15,carbG:9,totalFatG:2,sourceUrl:'https://chobani.example/drink'};
  const web=async()=>({data:{foods:[drink]},sourceUrls:['https://chobani.example/drink'],searches:1});
  // Same barcode already in the catalogue: that food, no model decision.
  let h=harness({usda:[],web,barcodes:['00818290015617'],near:[{id:77,name:'Chobani Drink',brand:'Chobani',gtin:'00818290015617'}],
    jev:{status:'ok',choice:'none',confidence:0.99}});
  let [candidate]=(await h.sources.searchFoodSources('Chobani drink',{gtin:'00818290015617'})).candidates;
  const same=await h.sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([same.status,same.foodId,h.calls.jev.length],['existing',77,0]);
  // A candidate with another barcode is another product and is never offered as a duplicate.
  h=harness({usda:[],web,barcodes:['00818290015617'],near:[{id:78,name:'Zero Sugar Greek Yogurt',brand:'Chobani',gtin:'00818290099999'}]});
  [candidate]=(await h.sources.searchFoodSources('Chobani drink',{gtin:'00818290015617'})).candidates;
  assert.equal((await h.sources.createFoodFromSource(candidate.sourceId)).status,'created');
  assert.equal(h.calls.jev.length,0);
  // Without barcodes on the candidate, Jev decides with serving and density facts.
  h=harness({usda:[],web,barcodes:['00818290015617'],near:[{id:7923,name:'Zero Sugar Greek Yogurt',brand:'Chobani',defaultServingWeightGram:150,
    kcalPerServing:60,proteinPerServing:11,Serving:[{servingName:'container',servingWeightGram:150,defaultServingAmount:1}]}],
    jev:{status:'ok',choice:'none',confidence:0.95}});
  [candidate]=(await h.sources.searchFoodSources('Chobani drink',{gtin:'00818290015617'})).candidates;
  assert.equal((await h.sources.createFoodFromSource(candidate.sourceId)).status,'created');
  const state=h.calls.jev[0].state;
  assert.deepEqual(state.newFood.servings,[{unit:'bottle',amount:1,grams:207}]);
  assert.equal(state.newFood.barcode,'00818290015617');
  assert.deepEqual(state.catalogue[0].servings,[{unit:'container',amount:1,grams:150}]);
  assert.equal(state.catalogue[0].kcalPer100g,40);
});

function attachHarness({food={id:15295,name:'Lala 100 +Proteina Leche 1% Grasa',brand:'Lala',gtin:null},owner=null,jev={status:'ok',choice:'same',confidence:0.96}}={}){
  const calls={enrich:[],jev:[],discovered:[]};
  const db={from:()=>{let byGtin=false;const q={select:()=>q,limit:()=>q,or:()=>q,is:()=>q,eq:column=>{byGtin=column==='gtin';return q},
    abortSignal:async()=>({data:byGtin?(owner?[owner]:[]):[{defaultServingWeightGram:250,kcalPerServing:130,proteinPerServing:15,Serving:[],...food}],error:null})};return q},
    rpc:(name,args)=>{calls.enrich.push(args);return {abortSignal:async()=>({data:{foodId:args.p_food_id,added:args.p_food.gtin?['gtin','alias']:[],conflict:false},error:null})}}};
  const sources=createFoodSources({userId:'00000000-0000-4000-8000-000000000001',messageId:1,barcodes:['07501020548440'],
    signal:new AbortController().signal,discover:id=>calls.discovered.push(id)},
    {db,embed:async()=>[],jev:async task=>{calls.jev.push(task);return jev}});
  return {sources,calls};
}

test('a decoded barcode is attached to the catalogue food the package is, so the next scan is a catalogue hit',async()=>{
  const {sources,calls}=attachHarness();
  assert.deepEqual(await sources.attachBarcode(15295,'7501020548440','Lala 100 +Proteína Leche Ultrafiltrada 1% Grasa 1L'),{status:'attached',foodId:15295});
  assert.equal(calls.enrich[0].p_food.gtin,'07501020548440');
  assert.deepEqual(calls.enrich[0].p_servings,[]);
  assert.equal(calls.jev[0].state.package.barcode,'07501020548440');
});

test('attaching a barcode refuses other products: another barcode, a sibling variant, or an undecoded code',async()=>{
  let h=attachHarness({food:{id:15295,name:'Lala Light',brand:'Lala',gtin:'07501020500001'}});
  assert.match((await h.sources.attachBarcode(15295,'07501020548440','Lala 100 1%')).reason,/another_barcode/);
  h=attachHarness({jev:{status:'ok',choice:'different',confidence:0.95}});
  assert.equal((await h.sources.attachBarcode(15295,'07501020548440','Lala Deslactosada')).status,'refused');
  h=attachHarness({jev:{status:'ok',choice:'same',confidence:0.6}});
  assert.equal((await h.sources.attachBarcode(15295,'07501020548440','Lala 100')).status,'refused','an unsure decision never attaches');
  h=attachHarness();
  assert.equal((await h.sources.attachBarcode(15295,'00016000229969','Cheerios')).reason,'barcode_not_decoded');
  for (const run of [h]) assert.equal(run.calls.enrich.length,0);
});

test('a barcode another food already carries points to that food instead of moving it',async()=>{
  const {sources,calls}=attachHarness({owner:{id:777}});
  assert.deepEqual(await sources.attachBarcode(15295,'07501020548440','Lala 100'),{status:'other_food',foodId:777});
  assert.equal(calls.enrich.length,0);
});

test('the duplicate check finds a food by its barcode even when embeddings miss it',async()=>{
  const {sources,calls}=harness({near:[],catalogue:[{id:15295,name:'Leche Lala 100 Proteina',brand:'Lala',gtin:'07501020548440'}],
    barcodes:['07501020548440'],usda:[{...usdaFood,name:'Lala 100 Protein Milk',brand:'Lala'}],usdaSearch:async()=>[{fdcId:2345,gtinUpc:'7501020548440'}]});
  const [candidate]=(await sources.searchFoodSources('Lala 100',{gtin:'07501020548440'})).candidates;
  const result=await sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([result.status,result.foodId],['existing',15295]);
  assert.equal(calls.create.length,0,'no duplicate for a product named differently in another language');
});

test('the duplicate check also sees the catalogue name search (any language or spelling)',async()=>{
  const {sources,calls}=harness({near:[],byName:[{id:50}],catalogue:[{id:50,name:'Ceviche de atun',brand:null}],
    jev:task=>({status:'ok',choice:Object.keys(task.options).find(k=>k!=='none'),confidence:0.95})});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  const result=await sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([result.status,result.foodId],['existing',50]);
  assert.deepEqual(calls.jev[0].state.catalogue.map(c=>c.id),[50]);
});

test('an estimate far from similar foods\' energy density goes back once to be re-checked',async()=>{
  const similar=[{id:1,name:'Ceviche',kcalPerServing:120},{id:2,name:'Fish ceviche',kcalPerServing:110},{id:3,name:'Shrimp ceviche',kcalPerServing:130}];
  const {sources,calls}=harness({near:similar,jev:{status:'ok',choice:'none',confidence:0.95}});
  const estimate=(kcal)=>sources.proposeEstimatedFood({name:'Tuna ceviche bowl',brand:null,per100g:{kcal,proteinG:15,carbG:8,totalFatG:3},
    servings:[{unit:'bowl',amount:1,grams:350}],basis:'Raw tuna, lime, onion, cucumber, avocado in typical proportions'});
  const high=estimate(317);
  const first=await sources.createFoodFromSource(high.sourceId);
  assert.equal(first.status,'recheck_estimate');
  assert.match(first.reason,/317 kcal\/100 g.*about 120/);
  assert.equal(calls.create.length,0);
  assert.equal((await sources.createFoodFromSource(high.sourceId)).status,'created','resubmitting the same source accepts it');
  assert.equal((await sources.createFoodFromSource(estimate(125).sourceId)).status,'created','a plausible estimate goes straight through');
});

test('a personal dish is created privately for the user; common foods stay shared',async()=>{
  const {sources,calls}=harness({near:[],jev:{status:'ok',choice:'none',confidence:0.95}});
  const dish=personal=>sources.proposeEstimatedFood({name:personal?"Grandma's lasagna":'Beef lasagna',brand:null,
    per100g:{kcal:160,proteinG:9,carbG:14,totalFatG:7},servings:[{unit:'slice',amount:1,grams:250}],
    basis:'Beef, pasta, ricotta and tomato sauce in typical home-recipe proportions',...(personal===undefined?{}:{personal})});
  await sources.createFoodFromSource(dish(true).sourceId);
  await sources.createFoodFromSource(dish(false).sourceId);
  await sources.createFoodFromSource(dish(undefined).sourceId);
  assert.deepEqual(calls.create.map(c=>c.p_private),[true,false,false]);
  assert.equal('personal' in calls.create[0].p_food,false,'the flag is not stored on the food');
});

test('duplicate candidates only come from shared foods and the user\'s own private foods',async()=>{
  const {sources,calls}=harness({jev:{status:'ok',choice:'none',confidence:0.95}});
  const [candidate]=(await sources.searchFoodSources('tuna ceviche')).candidates;
  await sources.createFoodFromSource(candidate.sourceId);
  const user='00000000-0000-4000-8000-000000000001';
  for (const name of ['search_meal_food_catalogue','get_cosine_results'])
    assert.equal(calls.rpc.find(([n])=>n===name)?.[1].p_user_id,user,name);
  assert.ok(calls.visibility.length>0&&calls.visibility.every(f=>f===`privateToUserId.is.null,privateToUserId.eq.${user}`));
});

test('a nutrition panel no one can name is saved for the user only; a named or barcoded one is shared',async()=>{
  const {sources,calls}=harness({near:[],usda:[],jev:{status:'ok',choice:'none',confidence:0.95},barcodes:['00016000229969']});
  const panel=(extra)=>sources.proposeLabelFood({name:'Protein shake',brand:null,servingUnit:'bottle',servingAmount:1,servingGrams:330,
    kcal:160,proteinG:30,carbG:5,totalFatG:3,fiberG:null,sugarG:null,satFatG:null,gtin:null,identified:false,...extra});
  for (const label of [panel({}),panel({name:'Fairlife Core Power Vanilla',identified:true}),panel({name:'Protein shake 2',gtin:'016000229969'})])
    await sources.createFoodFromSource(label.sourceId);
  assert.deepEqual(calls.create.map(c=>c.p_private),[true,false,false]);
  assert.throws(()=>sources.proposeLabelFood({name:'X shake',brand:null,servingUnit:'bottle',servingAmount:1,servingGrams:330,
    kcal:160,proteinG:30,carbG:5,totalFatG:3,fiberG:null,sugarG:null,satFatG:null,gtin:null}),'the agent must say whether the product is named');
});

test('a label that disagrees with the shared food becomes the user\'s own copy; the shared food is left as it is',async()=>{
  const shared=[{id:77,name:'Chobani Protein Drink',brand:'Chobani',gtin:'00818290015617'}];
  const label=h=>h.sources.proposeLabelFood({name:'Chobani Protein Drink',brand:'Chobani',servingUnit:'bottle',servingAmount:1,servingGrams:207,
    kcal:180,proteinG:20,carbG:12,totalFatG:4,fiberG:null,sugarG:null,satFatG:null,gtin:'00818290015617',identified:true});
  let h=harness({near:shared,barcodes:['00818290015617'],enrichConflict:true,createRow:{food_id:99002,created:true,enrichment:null}});
  const result=await h.sources.createFoodFromSource(label(h).sourceId);
  assert.deepEqual([result.status,result.foodId,result.variantOf],['created',99002,77]);
  assert.deepEqual([h.calls.create[0].p_private,h.calls.create[0].p_variant],[true,true]);
  assert.equal(h.calls.enrich.length,1,'the disagreement is recorded on the shared food, which changes nothing');
  h=harness({near:shared,barcodes:['00818290015617']});
  assert.deepEqual([(await h.sources.createFoodFromSource(label(h).sourceId)).foodId,h.calls.create.length],[77,0],'an agreeing label just uses the shared food');
});

test('only labels become private copies: another source that disagrees just records the conflict',async()=>{
  const drink={name:'Chobani Protein Drink',brand:'Chobani',servingUnit:'bottle',servingAmount:1,servingGrams:207,kcal:180,proteinG:20,carbG:12,
    totalFatG:4,sourceUrl:'https://chobani.example/drink'};
  const h=harness({usda:[],near:[{id:77,name:'Chobani Protein Drink',brand:'Chobani',gtin:'00818290015617'}],barcodes:['00818290015617'],enrichConflict:true,
    web:async()=>({data:{foods:[drink]},sourceUrls:['https://chobani.example/drink'],searches:1})});
  const [candidate]=(await h.sources.searchFoodSources('Chobani drink',{gtin:'00818290015617'})).candidates;
  assert.deepEqual([(await h.sources.createFoodFromSource(candidate.sourceId)).foodId,h.calls.create.length],[77,0]);
});

test('new foods never store the serving shapes the catalogue audit had to repair',()=>{
  const {cleanServings}=require('../src/mealResolution/foodSources.ts');
  const serving=(name,grams,amount=1)=>({name,grams,amount});
  assert.deepEqual(cleanServings([serving('1 cup',240,240)]),[serving('1 cup',240)],'kefir: "1 cup" would log 1 g');
  assert.deepEqual(cleanServings([serving('355 ml',355,355)]),[serving('355 ml',355)],'Spindrift: "355 x 355 ml"');
  assert.deepEqual(cleanServings([serving('cup',240,240)]),[serving('cup',240)]);
  assert.deepEqual(cleanServings([serving('1 Cup (37g)',37)]),[serving('1 Cup',37)],'the app would show "1 Cup (37g) (37g)"');
  assert.deepEqual(cleanServings([serving('tbsp',60),serving('cup',900)]),[],'impossible standard units');
  assert.deepEqual(cleanServings([serving('tsp',0.8),serving('cup',8),serving('2 tbsp.',31,2),serving('pieces',76,4)]),
    [serving('tsp',0.8),serving('cup',8),serving('2 tbsp.',31,2),serving('pieces',76,4)],'real small units, sensible multiples');
  assert.deepEqual(cleanServings([serving('g',1),serving('oz',28.35),serving('ml',1),serving('serving',0),serving('bottle',207),serving('bottle',207)]),
    [serving('bottle',207)],'basis units, missing weights and duplicates');
  assert.deepEqual(cleanServings([serving('Burrito',10),serving('Burrito',185)]),[serving('Burrito',185)],'placeholder next to the real serving');
  assert.deepEqual(cleanServings([serving('cup',30),serving('cup',240)]).length,2,'standard units keep both (chopped vs liquid is a naming issue)');
});

test('a verified source that is the same food as an estimate supersedes it; verified foods and estimates-vs-estimates do not',async()=>{
  const gpt={id:77,name:'Tuna Ceviche',brand:null,foodInfoSource:'GPT4'};
  let h=harness({catalogue:[gpt],near:[gpt],jev:task=>({status:'ok',choice:'food_77',confidence:0.95})});
  let [candidate]=(await h.sources.searchFoodSources('tuna ceviche')).candidates;
  const result=await h.sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([result.foodId,result.superseded,h.calls.supersede.length,h.calls.enrich.length],[77,true,1,0]);
  assert.equal(h.calls.jev[0].state.catalogue[0].estimate,true,'Jev is told the candidate\'s numbers may be wrong');
  h=harness({catalogue:[{...gpt,foodInfoSource:'USDA'}],near:[gpt],jev:{status:'ok',choice:'food_77',confidence:0.95}});
  [candidate]=(await h.sources.searchFoodSources('tuna ceviche')).candidates;
  await h.sources.createFoodFromSource(candidate.sourceId);
  assert.deepEqual([h.calls.supersede.length,h.calls.enrich.length],[0,1],'a verified food keeps its values');
  h=harness({catalogue:[gpt],near:[gpt],jev:{status:'ok',choice:'food_77',confidence:0.95}});
  const estimate=h.sources.proposeEstimatedFood({name:'Tuna ceviche',brand:null,per100g:{kcal:120,proteinG:15,carbG:6,totalFatG:3},
    servings:[{unit:'bowl',amount:1,grams:300}],basis:'Raw tuna, lime, onion and cucumber in typical proportions'});
  await h.sources.createFoodFromSource(estimate.sourceId);
  assert.equal(h.calls.supersede.length,0,'an estimate never supersedes another estimate');
});

const quinoaLabel={name:'Dark Chocolate + Sea Salt Quinoa Crisps',brand:'Undercover',servingUnit:'package',servingAmount:1,servingGrams:14,
  kcal:60,proteinG:1,carbG:10,totalFatG:3,fiberG:1,sugarG:3,satFatG:1.8,gtin:null,identified:true};
const quinoaNearby=[{id:15289,name:'Dark Chocolate + Sea Salt Crispy Quinoa',brand:'Undercover Snacks',defaultServingWeightGram:7,kcalPerServing:35},
  {id:2550,name:'Dark Chocolate Nuts & Sea Salt Bar',brand:'Kind'},{id:1609,name:'Dark Chocolate Sea Salt Clean Protein Bar',brand:'Ready'}];

test('an unsure duplicate check on a label asks only about the same brand, and sameAs settles it',async()=>{
  const {sources,calls}=harness({near:quinoaNearby,enrichConflict:true,jev:{status:'ok',choice:'food_15289',confidence:0.6}});
  const label=sources.proposeLabelFood(quinoaLabel);
  const asked=await sources.createFoodFromSource(label.sourceId);
  assert.equal(asked.status,'possible_duplicates');
  assert.deepEqual(asked.candidates.map(c=>c.id),[15289],'other brands are never candidates');
  assert.deepEqual(calls.jev[0].options,{none:null,food_15289:15289});
  await assert.rejects(sources.createFoodFromSource(label.sourceId,2550),/sameAs must be one of/);
  const picked=await sources.createFoodFromSource(label.sourceId,15289);
  assert.equal(picked.variantOf,15289,'the label disagrees (60 vs 70 kcal per 14 g): the user gets their own copy');
  assert.equal(calls.create.at(-1).p_private,true);
  assert.equal(calls.jev.length,1,'the answer does not run the duplicate check again');
});

test('sameAs null creates the label food; an unbranded label unsure among look-alikes is created outright',async()=>{
  let {sources,calls}=harness({near:quinoaNearby,jev:{status:'ok',choice:'food_15289',confidence:0.6}});
  const label=sources.proposeLabelFood(quinoaLabel);
  await sources.createFoodFromSource(label.sourceId);
  const created=await sources.createFoodFromSource(label.sourceId,null);
  assert.equal(created.status,'created');
  assert.equal(calls.create[0].p_food.kcal,60);
  ({sources,calls}=harness({near:[{id:8693,name:'Fast Foods, Submarine Sandwich, Steak And Cheese',brand:null}],
    jev:{status:'ok',choice:'food_8693',confidence:0.55}}));
  const baguette=sources.proposeLabelFood({name:'Baguette de Arrachera',brand:null,servingUnit:'g',servingAmount:100,servingGrams:100,
    kcal:163.74,proteinG:11.4,carbG:13.56,totalFatG:7.39,fiberG:1.49,sugarG:0.6,satFatG:3.29,gtin:null,packageGrams:270,identified:true});
  assert.deepEqual(baguette.servings,[{name:'package',grams:270,amount:1}],'the net weight becomes a package serving (grams are built in)');
  const made=await sources.createFoodFromSource(baguette.sourceId);
  assert.equal(made.status,'created','a label is authoritative: an unsure match to a generic sub never blocks it');
});

test('USDA unit codes read as units, and the calculator never evaluates code',()=>{
  const {cleanServings,readableUnits}=require('../src/mealResolution/foodSources.ts');
  const {calculate}=require('../src/mealResolution/calculate.ts');
  assert.equal(readableUnits('.25 ONZ'),'0.25 oz');
  assert.equal(readableUnits('8 OZA'),'8 fl oz');
  assert.deepEqual(cleanServings([{name:'.25 ONZ',grams:7,amount:1},{name:'15 MLT',grams:15,amount:1},{name:'GRM',grams:1,amount:1}]),
    [{name:'0.25 oz',grams:7,amount:1},{name:'15 mL',grams:15,amount:1}]);
  assert.equal(calculate('3/8 * 400'),150);
  assert.equal(calculate('(2 + 1.5) * 28.35'),99.225);
  assert.equal(calculate('-2 + .5'),-1.5);
  for (const bad of ['process.exit()','2 +','1/0','2 ** 3','(1']) assert.throws(()=>calculate(bad));
});

test('label readings: a misread digit shows in the energy check, and the column read maps to servings in code',async()=>{
  const {energyGap,labelSourceInput,readNutritionLabel}=require('../src/mealResolution/labelReader.ts');
  // "7,19" read as "2,79": 4 x 11.74 + 4 x 13.56 + 9 x 2.79 = 126 kcal, not the 165.74 printed.
  assert.ok(energyGap({kcal:165.74,proteinG:11.74,carbG:13.56,totalFatG:2.79})>0.2);
  assert.ok(energyGap({kcal:165.74,proteinG:11.74,carbG:13.56,totalFatG:7.19})<0.02);
  const per100={basis:'100g',servingUnit:null,servingAmount:null,basisGrams:100,packageGrams:270,kcal:165.74,kj:null,
    proteinG:11.74,carbG:13.56,totalFatG:7.19,satFatG:3.29,sugarG:0.6,fiberG:1.49};
  const input=labelSourceInput(per100,{name:'Baguette de Arrachera',brand:'Aerocomidas',gtin:null,identified:true});
  assert.deepEqual([input.servingUnit,input.servingAmount,input.servingGrams,input.packageGrams],['g',100,100,270]);
  const perServing=labelSourceInput({...per100,basis:'serving',servingUnit:'2 cookies',servingAmount:2,basisGrams:30,packageGrams:null},
    {name:'Cookies',brand:null,gtin:null,identified:true});
  assert.deepEqual([perServing.servingUnit,perServing.servingAmount,perServing.servingGrams],['cookies',2,30]);
  // The reader asks again when the digits do not add up, and keeps the reading that does; prose means illegible.
  const sharp=require('sharp');
  const photo=await sharp({create:{width:40,height:30,channels:3,background:'#fff'}}).jpeg().toBuffer();
  const replies=[{...per100,legible:true,totalFatG:2.79},{...per100,legible:true}];const prompts=[];
  const fetch=async(url,init)=>String(url).startsWith('https://photo')?new Response(photo):
    (prompts.push(JSON.parse(init.body).messages[0].content[0].text),new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(replies.shift())}}]})));
  const facts=await readNutritionLabel(new URL('https://photo.example/1.jpg'),{fetch,env:{OPENROUTER_API_KEY:'k'}});
  assert.equal(facts.totalFatG,7.19);
  assert.match(prompts[1],/126 kcal/,'the hint carries the arithmetic, done in code');
  const prose=async(url)=>String(url).startsWith('https://photo')?new Response(photo):new Response(JSON.stringify({choices:[{message:{content:'I cannot read this label.'}}]}));
  assert.equal(await readNutritionLabel(new URL('https://photo.example/1.jpg'),{fetch:prose,env:{OPENROUTER_API_KEY:'k'}}),null);
});
