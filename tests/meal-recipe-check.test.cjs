require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compileCheckedMealPlan}=require('../src/mealResolution/historyCheck');
const {foodSummary}=require('../src/mealResolution/evidence');

// A recipe is logged only when the user's words name it: the backend check asks Jev, and a plan using a recipe the
// user didn't mean goes back to the agent with recipe_not_referenced.
const recipe={id:9,name:'Chicken pasta',brand:null,lastUpdated:'2026-09-30T00:00:00Z',defaultServingWeightGram:250,weightUnknown:false,
  kcalPerServing:450,proteinPerServing:35,carbPerServing:40,totalFatPerServing:12,satFatPerServing:null,transFatPerServing:null,
  fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,privateToUserId:'u',recipePortions:12,
  Serving:[{id:91,foodItemId:9,servingName:'portion',servingWeightGram:250,defaultServingAmount:1}]};
const pasta={...recipe,id:5,name:'Pasta, cooked',privateToUserId:null,recipePortions:null,defaultServingWeightGram:100,
  Serving:[]};
const input=text=>({userId:'u',operationId:'o',messageId:1,originalText:text,consumedOn:'2026-09-30T12:00:00Z',
  submittedAt:'2026-09-30T12:00:00Z',timezone:'UTC',locale:null,attachmentIds:[]});
const result=(food,quantity,text)=>({proposal:{schemaVersion:1,outcome:'resolved',consumedOn:'2026-09-30T12:00:00Z',historyGroupSelections:[],
  items:[{foodId:food.id,quantity,groupId:null,groupLabel:null,evidence:[`food:${food.id}`]}],
  components:[{sourceText:text,itemIndexes:[0],historySelectionIndexes:[],omitted:false}],claims:[],clarification:null},
  evidence:{foods:new Map([[food.id,food]]),events:new Map()},photoIds:[],model:'fixture',provider:'test',durationMs:0,steps:1,toolCalls:1});
const jev=answer=>async request=>{jev.asked=request.state;return {status:'ok',choice:answer,confidence:0.97}};

test('a named recipe is logged in portions',async()=>{
  const text='1.5 portions of my chicken pasta';
  const plan=await compileCheckedMealPlan(input(text),result(recipe,{kind:'serving',servingId:91,amount:1.5},text),{jev:jev('yes')});
  assert.equal(plan.items[0].grams,375);
  assert.equal(plan.items[0].loggedUnit,'portion');
  assert.equal(jev.asked.recipeName,'Chicken pasta');
});

test('a recipe the words do not name goes back to the agent',async()=>{
  const text='pasta at Olive Garden';
  await assert.rejects(compileCheckedMealPlan(input(text),result(recipe,{kind:'serving',servingId:91,amount:1},text),{jev:jev('no')}),
    error=>error.message==='recipe_not_referenced'&&/Chicken pasta \(food 9\)/.test(error.detail));
  // A low-confidence yes is a no, and a failed check never lets the recipe through.
  await assert.rejects(compileCheckedMealPlan(input(text),result(recipe,{kind:'serving',servingId:91,amount:1},text),
    {jev:async()=>({status:'ok',choice:'yes',confidence:0.6})}),/recipe_not_referenced/);
  await assert.rejects(compileCheckedMealPlan(input(text),result(recipe,{kind:'serving',servingId:91,amount:1},text),
    {jev:async()=>{throw new Error('timeout')}}),/recipe_not_referenced/);
});

test('catalogue foods are not checked',async()=>{
  let asked=0;
  const text='pasta at Olive Garden';
  const plan=await compileCheckedMealPlan(input(text),result(pasta,{kind:'mass',grams:300},text),{jev:async()=>{asked++;return {status:'ok',choice:'no'}}});
  assert.equal(plan.items.length,1);
  assert.equal(asked,0);
});

test('the agent sees a recipe as yours and in portions',()=>{
  const summary=foodSummary(recipe);
  assert.equal(summary.yours,true);
  assert.deepEqual(summary.recipe,{portions:12});
  assert.deepEqual(summary.servings,[{id:91,unit:'portion',gramsPerUnit:250}]);
  assert.equal(foodSummary(pasta).recipe,undefined);
});
