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
