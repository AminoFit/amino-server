require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveMeal}=require('../src/mealResolution/resolve');

const rice={id:3,name:'White rice, cooked',brand:null,lastUpdated:'2026-09-01T00:00:00Z',defaultServingWeightGram:100,weightUnknown:false,
  kcalPerServing:130,proteinPerServing:2.7,carbPerServing:28,totalFatPerServing:0.3,satFatPerServing:null,transFatPerServing:null,
  fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,Serving:[]};
const input={userId:'00000000-0000-4000-8000-000000000001',operationId:'00000000-0000-4000-8000-000000000002',messageId:1,
  originalText:'150 g rice and a banana',consumedOn:'2026-09-25T12:00:00Z',submittedAt:'2026-09-25T12:00:00Z',timezone:'UTC',locale:null,attachmentIds:[]};
const evidence=(searched=[])=>{const foods=new Map([[3,rice]]);return {foods,events:new Map(),discover(){},
  async listMealEvents(){return {events:[]}},async prefetchFoods(){return []},async findFoodsByGtin(){return []},
  async searchFoods(q){searched.push(q);return {candidates:[{id:3,name:rice.name}],foods:[{id:3,name:rice.name}]}},
  async getFoodsAndServings(){return {foods:[rice]}}}};
const plan=(components)=>({schemaVersion:1,outcome:'resolved',consumedOn:input.consumedOn,historyGroupSelections:[],
  items:[{foodId:3,quantity:{kind:'mass',grams:150},groupId:null,groupLabel:null,evidence:['food:3']}],components,claims:[],clarification:null});
const noSources={sources:new Map(),async searchFoodSources(){return {candidates:[{sourceId:'web:0',name:'Banana'}]}}};

test('a plan the backend rejects resumes the same conversation with the problem, then passes',async()=>{
  const calls=[];
  const bad=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:false}]);
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  const generate=async options=>{
    calls.push(options.messages);
    return calls.length===1?{output:bad,response:{messages:[{role:'assistant',content:'draft'}]}}:{output:good,response:{messages:[]}};
  };
  const result=await resolveMeal(input,{evidence:evidence(),sources:noSources,generate,loadPhotos:async()=>[],model:()=>({id:'test',provider:'test',model:{}})});
  assert.equal(calls.length,2);
  assert.equal(calls[1][1].content,'draft','the first answer stays in the conversation');
  assert.match(calls[1][2].content,/dropped_meal_mention/);
  assert.equal(result.checked,true);
  assert.equal(result.proposal.components[1].omitted,true);
});

test('a plan that passes the check needs no extra model call',async()=>{
  let calls=0;
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  const result=await resolveMeal(input,{evidence:evidence(),sources:noSources,loadPhotos:async()=>[],
    generate:async()=>{calls++;return {output:good,response:{messages:[]}}},model:()=>({id:'test',provider:'test',model:{}})});
  assert.equal(calls,1);
  assert.equal(result.checked,true);
});

test('findFood: the catalogue is the cache; sources only when it is empty or asked again, USDA before the web',async()=>{
  const searched=[],calls=[];
  const sources={...noSources,async searchFoodSources(q,options){calls.push([q,options.web]);return noSources.searchFoodSources(q)}};
  const generate=async options=>{
    const find=args=>options.tools.findFood.execute({gtin:null,includeSources:false,labelSourceId:null,...args},{});
    const hit=await find({query:'rice'});
    assert.equal(hit.catalogue[0].id,3);
    assert.deepEqual(hit.sources,[]);
    const first=await find({query:'banana',includeSources:true});
    assert.deepEqual(first.sources,[],'catalogue results come first even when sources are requested');
    assert.match(first.note,/call again/);
    const usda=await find({query:'Banana ',includeSources:true});
    assert.equal(usda.sources[0].name,'Banana');
    await find({query:'banana',includeSources:true});
    return {output:plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false}])};
  };
  await resolveMeal(input,{evidence:evidence(searched),sources,generate,loadPhotos:async()=>[],model:()=>({id:'test',provider:'test',model:{}})});
  assert.deepEqual(searched,['rice','banana','Banana ','banana']);
  assert.deepEqual(calls,[['Banana ',false],['banana',true]],'USDA first, the web only after USDA was shown');
});

test('attachBarcode only accepts barcodes decoded from this meal, and the attached food then covers the barcode',async()=>{
  const attached=[];
  const sources={...noSources,async attachBarcode(foodId,gtin,name){attached.push([foodId,gtin,name]);return {status:'attached',foodId}}};
  const generate=async options=>{
    const refused=await options.tools.attachBarcode.execute({foodId:3,gtin:'016000229969',packageName:'Rice'},{});
    assert.equal(refused.reason,'barcode_not_decoded');
    const ok=await options.tools.attachBarcode.execute({foodId:3,gtin:'7501020548440',packageName:'Rice 1kg'},{});
    assert.equal(ok.food.gtin,'07501020548440');
    return {output:plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false}])};
  };
  const result=await resolveMeal({...input,originalText:'150 g rice'},{evidence:evidence(),sources,generate,barcodes:['07501020548440'],
    loadPhotos:async()=>[],model:()=>({id:'test',provider:'test',model:{}})});
  assert.deepEqual(attached,[[3,'07501020548440','Rice 1kg']]);
  assert.equal(result.checked,true,'the barcode check passes once the food carries the barcode');
});

test('an unparseable model answer is retried once instead of failing the meal',async()=>{
  const {NoObjectGeneratedError}=require('ai');
  let calls=0;
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  const result=await resolveMeal(input,{evidence:evidence(),sources:noSources,loadPhotos:async()=>[],model:()=>({id:'test',provider:'test',model:{}}),
    generate:async()=>{calls++;if (calls===1) throw new NoObjectGeneratedError({message:'No object generated: could not parse the response.',text:'{',
      response:{id:'x',timestamp:new Date(),modelId:'m'},usage:{inputTokens:1,outputTokens:1,totalTokens:2},finishReason:'stop'});
      return {output:good,response:{messages:[]}}}});
  assert.equal(calls,2);
  assert.equal(result.checked,true);
});

test('a first look at the photos reaches the first turn with catalogue candidates for each component',async()=>{
  const searched=[];let firstPrompt;
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  const result=await resolveMeal(input,{evidence:evidence(searched),sources:noSources,readBarcode:async()=>null,
    loadPhotos:async()=>[{id:7,url:new URL('https://photos.example/7.jpg')}],
    visible:async()=>[{food:'white rice',detail:'bowl'},{food:'banana',detail:'on the side'}],
    generate:async options=>{firstPrompt??=JSON.stringify(options.messages);return {output:good,response:{messages:[]}}},
    model:()=>({id:'test',provider:'test',model:{}})});
  assert.deepEqual(searched,['white rice','banana']);
  assert.match(firstPrompt,/visibleFoods/);
  assert.match(firstPrompt,/White rice, cooked/,'candidates come with the list');
  assert.deepEqual(result.visibleFoods.map(v=>v.food),['white rice','banana']);
});

test('the first look becomes a greyed preview for the app; its estimates never reach the agent',async()=>{
  const {buildPreview}=require('../src/mealResolution/progress');
  const rice={id:3,name:'Jasmine Rice (dry)',servingGrams:100,kcal:360,proteinG:7,carbG:79,totalFatG:0.6};
  assert.deepEqual(buildPreview([
    {food:'cooked jasmine rice',detail:'bowl',grams:180,estimate:{kcal:234,proteinG:4.9,carbG:50,totalFatG:0.5},catalogue:[rice]},
    {food:'mystery sauce',detail:'',grams:20,estimate:{kcal:null,proteinG:null,carbG:null,totalFatG:null},catalogue:[]},
    {food:'banana',detail:'',grams:120,catalogue:[{...rice,id:4,name:'Banana',kcal:89,proteinG:1.1,carbG:23,totalFatG:0.3}]}]),[
    {name:'cooked jasmine rice',foodId:3,grams:180,kcal:234,proteinG:4.9,carbG:50,totalFatG:0.5},
    {name:'mystery sauce',foodId:null,grams:20,kcal:null,proteinG:null,carbG:null,totalFatG:null},
    {name:'banana',foodId:4,grams:120,kcal:106.8,proteinG:1.3,carbG:27.6,totalFatG:0.4}],
    'the first look names and estimates (cooked, not the dry candidate); a candidate lends its density only without an estimate');
  const stages=[];let firstPrompt;
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  // Catalogue search returns full summaries (serving weight and nutrients), as in production.
  const withNutrition={...evidence(),async searchFoods(){return {candidates:[{id:3,name:rice.name}],foods:[rice]}}};
  await resolveMeal(input,{evidence:withNutrition,sources:noSources,readBarcode:async()=>null,
    loadPhotos:async()=>[{id:7,url:new URL('https://photos.example/7.jpg')}],
    visible:async()=>[{food:'cooked rice',detail:'bowl',grams:180,estimate:{kcal:234,proteinG:4.9,carbG:50,totalFatG:0.5}}],
    onProgress:(stage,preview)=>{stages.push([stage,preview?.map(p=>[p.name,p.kcal,p.foodId])])},
    generate:async options=>{firstPrompt??=JSON.stringify(options.messages);return {output:good,response:{messages:[]}}},
    model:()=>({id:'test',provider:'test',model:{}})});
  assert.deepEqual(stages,[['found',[['cooked rice',234,null]]],['found',[['cooked rice',234,3]]],['checking',undefined]],
    'the preview goes out at once, then again with the candidate for its icon');
  assert.match(firstPrompt,/cooked rice/);
  assert.doesNotMatch(firstPrompt,/234|180/,"the first look's portions and estimates stay out of the agent's evidence");
});

test('a text meal streams its preview item by item, gains icons after, and none of it reaches the agent',async()=>{
  const stages=[],searched=[];let firstPrompt,resolveStream;
  const streamed=new Promise(resolve=>{resolveStream=resolve});
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  const rice={id:3,name:'White rice, cooked',servingGrams:100,kcal:130,proteinG:2.7,carbG:28,totalFatG:0.3};
  const withNutrition={...evidence(searched),async searchFoods(query){searched.push(query);return {candidates:[],foods:query==='rice'?[rice]:[]}}};
  await resolveMeal({...input,attachmentIds:[]},{evidence:withNutrition,sources:noSources,readBarcode:async()=>null,loadPhotos:async()=>[],
    textFoods:async(text,onFoods)=>{
      const foods=[{food:'rice',detail:'',grams:150,estimate:{kcal:195,proteinG:4,carbG:42,totalFatG:0.4}},
        {food:'banana',detail:'',grams:118,estimate:{kcal:105,proteinG:1.3,carbG:27,totalFatG:0.4}}];
      onFoods(foods.slice(0,1));onFoods(foods);resolveStream();return foods},
    onProgress:(stage,preview)=>{stages.push([stage,preview?.map(p=>[p.name,p.kcal,p.foodId])])},
    generate:async options=>{firstPrompt??=JSON.stringify(options.messages);await streamed;return {output:good,response:{messages:[]}}},
    model:()=>({id:'test',provider:'test',model:{}})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(stages.filter(([stage])=>stage==='found').slice(0,3),[['found',[['rice',195,null]]],
    ['found',[['rice',195,null],['banana',105,null]]],['found',[['rice',195,3],['banana',105,null]]]],
    'one update per completed item, then again with catalogue candidates for icons');
  assert.ok(searched.includes('rice')&&searched.includes('banana'));
  assert.doesNotMatch(firstPrompt,/195|118/,"the preview's portions and estimates stay out of the agent's evidence");
});

test('streamTextFoods emits the list so far after each completed element and drops unnamed ones',async()=>{
  const {streamTextFoods}=require('../src/mealResolution/textPreview');
  const updates=[];let request;
  const stream=options=>{request=options;return {elementStream:(async function*(){
    yield {food:'flat white',estimatedGrams:240,estimatedKcal:120,estimatedProteinG:7,estimatedCarbG:10,estimatedFatG:6};
    yield {food:' ',estimatedGrams:10};
    yield {food:'banana bread',estimatedGrams:90000,estimatedKcal:320,estimatedProteinG:5,estimatedCarbG:50,estimatedFatG:12}})()}};
  const foods=await streamTextFoods('a flat white and banana bread',found=>updates.push(found.map(f=>f.food)),
    {stream,env:{OPENROUTER_API_KEY:'k'}});
  assert.deepEqual(updates,[['flat white'],['flat white','banana bread']]);
  assert.equal(foods[1].grams,null,'an implausible amount becomes unknown');
  assert.match(request.prompt,/"a flat white and banana bread"/,'the description goes in as quoted data');
  assert.deepEqual(await streamTextFoods('eggs',()=>{},{stream,env:{}}),[],'no key, no call');
});

test("the agent gets the user's own clock for relative dates, not just a UTC instant and a zone name",async()=>{
  let firstPrompt;
  const good=plan([{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false},
    {sourceText:'a banana',itemIndexes:[],historySelectionIndexes:[],omitted:true}]);
  await resolveMeal({...input,consumedOn:'2026-09-28T07:21:35Z',submittedAt:'2026-09-28T07:21:35Z',timezone:'America/Denver'},
    {evidence:evidence(),sources:noSources,readBarcode:async()=>null,loadPhotos:async()=>[],
      generate:async options=>{firstPrompt??=JSON.stringify(options.messages);return {output:good,response:{messages:[]}}},
      model:()=>({id:'test',provider:'test',model:{}})});
  assert.match(firstPrompt,/submittedAtLocal\\":\\"Monday 2026-09-28 01:21/);
  assert.match(firstPrompt,/consumedOnLocal\\":\\"Monday 2026-09-28 01:21/);
});

// Message 30352: a photo of a bag's barcode and nothing else took the agent three 120 s runs and failed.
const fruit={id:52000,name:'Mangoes, Blueberries and Blueberries',brand:'Amazon Fresh',gtin:'00195515039802',lastUpdated:'2026-09-29T00:00:00Z',
  defaultServingWeightGram:140,weightUnknown:false,kcalPerServing:70,proteinPerServing:1,carbPerServing:17,totalFatPerServing:0,
  satFatPerServing:0,transFatPerServing:null,fiberPerServing:2.9,sugarPerServing:13,addedSugarPerServing:null,
  Serving:[{id:700,foodItemId:52000,servingName:'cup',servingWeightGram:140,defaultServingAmount:1}]};
const photoInput={...input,originalText:'',attachmentIds:[8414]};
const barcodeDeps=(overrides={})=>{
  const created=[];
  const foods=new Map();
  const ev={foods,events:new Map(),discover(){},forget(id){foods.delete(id)},
    async listMealEvents(){return {events:[]}},async prefetchFoods(){return []},async findFoodsByGtin(){return overrides.catalogue??[]},
    async searchFoods(){return {candidates:[],foods:[]}},async getFoodsAndServings(ids){foods.set(fruit.id,fruit);return {foods:ids.includes(fruit.id)?[fruit]:[]}}};
  const sources={sources:new Map(),async barcodeSources(gtin){return overrides.noSource?[]:[{sourceId:'off:0',gtin}]},
    async createFoodFromSource(id){created.push(id);return overrides.duplicate?{status:'possible_duplicates',candidates:[]}:{status:'created',foodId:fruit.id}},
    async searchFoodSources(){return {candidates:[]}}};
  return {created,deps:{evidence:ev,sources,loadPhotos:async()=>[{id:8414,url:new URL('https://example.com/p.jpg')}],
    readBarcode:async()=>'00195515039802',visible:async()=>overrides.visible??[{food:'frozen fruit'}],
    // The barcode-aware first look: one barcoded package, plus whatever else the case puts in the photo.
    scene:async()=>({barcodePackages:[{photo:0,count:1}],otherPackages:[],otherFoods:(overrides.visible??[]).slice(1).map(item=>({...item,detail:'',grams:150})),
      samePackageViews:false}),
    generate:async()=>{throw new Error('the agent must not run')},model:()=>({id:'test',provider:'test',model:{}})}};
};

test('a photo that is only a barcode logs one serving of that product without the agent',async()=>{
  const {created,deps}=barcodeDeps();
  const result=await resolveMeal(photoInput,deps);
  assert.deepEqual(created,['off:0']);
  assert.equal(result.model,'barcode');
  assert.equal(result.steps,0);
  assert.deepEqual(result.barcodes,['00195515039802']);
  assert.deepEqual(result.proposal.items[0].foodId,52000);
  assert.deepEqual(result.proposal.items[0].quantity,{kind:'serving',servingId:700,amount:1});
  assert.equal(result.proposal.components[0].sourceText,'photo: Amazon Fresh Mangoes, Blueberries and Blueberries');
});

test('a barcode already in the catalogue is logged straight from it',async()=>{
  const {created,deps}=barcodeDeps({catalogue:[fruit]});
  const result=await resolveMeal(photoInput,deps);
  assert.deepEqual(created,[]);
  assert.equal(result.proposal.items[0].foodId,52000);
});

test('the agent still handles barcodes with text, other visible foods, no source or a possible duplicate',async()=>{
  const agentPlan={schemaVersion:1,outcome:'needs_clarification',consumedOn:input.consumedOn,historyGroupSelections:[],items:[],components:[],claims:[],clarification:'Which fruit mix is it?'};
  for (const [label,run] of [['text',{input:{...photoInput,originalText:'half the bag'}}],
    ['other food',{overrides:{visible:[{food:'frozen fruit'},{food:'yogurt'}]}}],['no source',{overrides:{noSource:true}}],
    ['duplicate',{overrides:{duplicate:true}}]]) {
    const {deps}=barcodeDeps(run.overrides);
    let agent=0;
    const result=await resolveMeal(run.input??photoInput,{...deps,generate:async()=>{agent++;return {output:agentPlan,response:{messages:[]}}}});
    assert.equal(agent,1,label);
    assert.equal(result.proposal.outcome,'needs_clarification',label);
  }
});

// Barcode route plan: a decoded barcode is locked; vision never names or replaces it.
const bar={...fruit,id:52001,name:'trü frü raspberries in white & milk chocolate',brand:'trü frü',gtin:'00850241008835',defaultServingWeightGram:28,kcalPerServing:90,
  Serving:[{id:701,foodItemId:52001,servingName:'pouch',servingWeightGram:28,defaultServingAmount:1}]};
const lockedDeps=({reads,scene,catalogue=[fruit,bar]})=>{
  const foods=new Map();
  const ev={foods,events:new Map(),discover(){},forget(id){foods.delete(id)},
    async listMealEvents(){return {events:[]}},async prefetchFoods(){return []},
    async findFoodsByGtin(gtins){return catalogue.filter(food=>gtins.includes(food.gtin))},
    async searchFoods(){return {candidates:[],foods:[]}},
    async getFoodsAndServings(ids){const found=catalogue.filter(food=>ids.includes(food.id));for (const f of found) foods.set(f.id,f);return {foods:found}}};
  const sources={sources:new Map(),async barcodeSources(){return []},async createFoodFromSource(){throw new Error('unused')},async searchFoodSources(){return {candidates:[]}}};
  let agentRuns=0;
  return {agentRuns:()=>agentRuns,deps:{evidence:ev,sources,
    loadPhotos:async()=>reads.map((_,index)=>({id:9000+index,url:new URL(`https://example.com/${index}.jpg`)})),
    readBarcodes:async url=>reads[Number(url.pathname.match(/(\d+)\.jpg/)[1])],
    // The first look invents a product for the bag, as it did for meal 30389.
    visible:async()=>[{food:'LesserEvil Himalayan Pink Salt Popcorn',detail:'identified by barcode',grams:28}],
    scene:async()=>scene,photoFastRoute:false,
    generate:async()=>{agentRuns++;return {output:{schemaVersion:1,outcome:'needs_clarification',consumedOn:input.consumedOn,
      historyGroupSelections:[],items:[],components:[],claims:[],clarification:'Which product is the other package?'},response:{messages:[]}}},
    model:()=>({id:'test',provider:'test',model:{}})}};
};
const onlyBarcodes=(counts,same=false)=>({barcodePackages:counts.map((count,photo)=>({photo,count})),otherPackages:[],otherFoods:[],samePackageViews:same});

test('meal 30389: a barcode alone is its product, whatever the first look calls the bag',async()=>{
  const {deps,agentRuns}=lockedDeps({reads:[{gtins:['00850241008835'],undecoded:0}],scene:onlyBarcodes([1])});
  const result=await resolveMeal(photoInput,deps);
  assert.equal(agentRuns(),0);
  assert.equal(result.model,'barcode');
  assert.deepEqual(result.proposal.items.map(item=>item.foodId),[52001]);
  assert.equal(result.checked,true,'no second look to overrule it');
});

test('two barcodes in one photo are two products; the same barcode in two photos is one',async()=>{
  const two=await resolveMeal(photoInput,lockedDeps({reads:[{gtins:['00850241008835','00195515039802'],undecoded:0}],scene:onlyBarcodes([2])}).deps);
  assert.deepEqual(two.proposal.items.map(item=>item.foodId).sort(),[52000,52001]);
  const views=await resolveMeal(photoInput,lockedDeps({reads:[{gtins:['00850241008835'],undecoded:0},{gtins:['00850241008835'],undecoded:0}],
    scene:onlyBarcodes([1,1],true)}).deps);
  assert.deepEqual(views.proposal.items.map(item=>item.foodId),[52001]);
});

test('a barcode that will not read, or another package, goes to the agent with the product locked',async()=>{
  for (const [label,reads,scene] of [['undecoded',[{gtins:['00850241008835'],undecoded:1}],onlyBarcodes([1])],
    ['second package',[{gtins:['00850241008835'],undecoded:0}],{...onlyBarcodes([1]),otherPackages:[{photo:0,legibleText:null}]}]]) {
    const {deps,agentRuns}=lockedDeps({reads,scene});
    let prompt;
    await resolveMeal(photoInput,{...deps,generate:async options=>{prompt=JSON.stringify(options.messages);return deps.generate()}});
    assert.equal(agentRuns(),1,label);
    assert.match(prompt,/lockedProducts.*52001/,label);
    assert.doesNotMatch(prompt,/LesserEvil/,`${label}: the invented name never reaches the agent`);
  }
});

test('views of one scanned package: a nutrition label that disagrees with the record goes to the agent to log the label',async()=>{
  const views={reads:[{gtins:['00850241008835'],undecoded:0},{gtins:[],undecoded:0}],scene:onlyBarcodes([1,0],true)};
  // trü frü record: 90 kcal per 28 g (3.2 kcal/g). The label photo says 130 kcal per 28 g: the label wins.
  const label=kcal=>async()=>({basis:'serving',servingUnit:'pouch',servingAmount:1,basisGrams:28,packageGrams:null,kcal,kj:null,
    proteinG:1,carbG:14,totalFatG:5,satFatG:3,sugarG:12,fiberG:1});
  const agreeing=lockedDeps(views);
  const same=await resolveMeal(photoInput,{...agreeing.deps,readLabel:label(92)});
  assert.equal(same.model,'barcode');
  assert.equal(agreeing.agentRuns(),0);
  const disagreeing=lockedDeps(views);
  let prompt;
  await resolveMeal(photoInput,{...disagreeing.deps,readLabel:label(130),
    generate:async options=>{prompt=JSON.stringify(options.messages);return disagreeing.deps.generate()}});
  assert.equal(disagreeing.agentRuns(),1);
  assert.match(prompt,/labelDisagrees.*00850241008835/);
});
