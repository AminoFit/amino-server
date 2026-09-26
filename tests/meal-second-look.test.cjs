require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compileCheckedMealPlan}=require('../src/mealResolution/historyCheck');

const food=(id,name,description)=>({id,name,brand:null,description,lastUpdated:'2026-09-01T00:00:00Z',defaultServingWeightGram:100,weightUnknown:false,
  kcalPerServing:120,proteinPerServing:20,carbPerServing:4,totalFatPerServing:2,satFatPerServing:null,transFatPerServing:null,
  fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,Serving:[]});
const input={userId:'u',operationId:'o',messageId:1,originalText:'Half of this tuna ceviche',consumedOn:'2026-09-25T12:00:00Z',
  submittedAt:'2026-09-25T12:00:00Z',timezone:'UTC',locale:null,attachmentIds:[7]};
const result=(photoUrls)=>({proposal:{schemaVersion:1,outcome:'resolved',consumedOn:input.consumedOn,historyGroupSelections:[],
  items:[{foodId:1,quantity:{kind:'estimated_mass',grams:175,basis:'half of a large bowl'},groupId:null,groupLabel:null,evidence:['photo']}],
  components:[{sourceText:'tuna ceviche',itemIndexes:[0],historySelectionIndexes:[],omitted:false}],claims:[],clarification:null},
  evidence:{foods:new Map([[1,food(1,'Tuna Ceviche','Made with tuna, onion and lime.')]]),events:new Map()},
  photoIds:[7],photoUrls,model:'fixture',provider:'test',durationMs:0,steps:1,toolCalls:1});

test('a second look at the photos sends unlogged foods back for a repair turn',async()=>{
  let seen;
  const missing=async(urls,text,logged)=>{seen={urls,text,logged};return ['mango','cucumber']};
  await assert.rejects(compileCheckedMealPlan(input,result([new URL('https://photos.example/1.jpg')]),{missing}),/missing_visible_food: mango, cucumber/);
  assert.deepEqual(seen.logged,[{name:'Tuna Ceviche',contains:'Made with tuna, onion and lime.'}],'the critic sees what the dish contains');
});

test('no second look without photos, on the repair turn, or when nothing is missing',async()=>{
  let calls=0;
  const missing=async()=>{calls++;return ['mango']};
  assert.equal((await compileCheckedMealPlan(input,result([]),{missing})).items.length,1);
  assert.equal((await compileCheckedMealPlan(input,result([new URL('https://photos.example/1.jpg')]),{missing,secondLook:false})).items.length,1);
  assert.equal(calls,0);
  assert.equal((await compileCheckedMealPlan(input,result([new URL('https://photos.example/1.jpg')]),{missing:async()=>[]})).items.length,1);
});
