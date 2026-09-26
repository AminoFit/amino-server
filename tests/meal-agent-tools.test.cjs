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
