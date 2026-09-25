require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compileMealPlan}=require('../src/mealResolution/compile');

const nutrients=(kcal,proteinG,carbG,totalFatG)=>({kcal,proteinG,carbG,totalFatG,
  fiberG:2,vitaminCMg:4});
const historyFood=(id,foodItemId,groupId)=>({id,updatedAt:'2026-09-23T15:00:00Z',
  foodItemId,name:`food ${id}`,brand:null,grams:100,kcal:100,nutrition:nutrients(100,5,10,2),
  servingId:null,servingAmount:null,loggedUnit:'g',groupId});

test('a referenced dish publishes each chosen component and preserves every historical nutrient',()=>{
  const foods=[historyFood(1,11,'smoothie'),historyFood(2,12,'smoothie'),
    historyFood(3,13,'smoothie'),historyFood(4,14,'smoothie'),historyFood(5,15,'side')];
  const event={messageId:42,revision:1,originalText:'Smoothie and eggs',
    consumedOn:'2026-09-23T08:00:00Z',hasimages:false,foods,
    groups:[{id:'smoothie',label:'Smoothie'},{id:'side',label:'Side dish'}]};
  const input={userId:'test',operationId:'test',messageId:50,
    originalText:'Same smoothie as yesterday',consumedOn:'2026-09-24T08:00:00Z',
    submittedAt:'2026-09-24T08:00:00Z',timezone:'America/New_York',locale:'en-US',attachmentIds:[]};
  const proposal={schemaVersion:1,outcome:'resolved',consumedOn:input.consumedOn,
    historyGroupSelections:[{sourceMessageId:42,groupId:'smoothie',scale:1,excludeLoggedFoodItemIds:[]}],
    items:[],
    claims:[],clarification:null};
  const compiled=compileMealPlan(input,{proposal,evidence:{events:new Map([[42,event]]),foods:new Map()},
    model:'fixture',provider:'test',durationMs:0,steps:0,toolCalls:1});
  assert.equal(compiled.items.length,4);
  assert.deepEqual(compiled.items.map(item=>item.foodId),[11,12,13,14]);
  assert.deepEqual(compiled.items.map(item=>item.nutrition.vitaminCMg),[4,4,4,4]);
  assert.deepEqual(compiled.groups,[{id:'smoothie',label:'Smoothie'}]);
  const omitted=compileMealPlan(input,{proposal:{...proposal,historyGroupSelections:[{
    ...proposal.historyGroupSelections[0],excludeLoggedFoodItemIds:[4]}]},
    evidence:{events:new Map([[42,event]]),foods:new Map()},
    model:'fixture',provider:'test',durationMs:0,steps:0,toolCalls:1});
  assert.deepEqual(omitted.items.map(item=>item.foodId),[11,12,13]);
});

test('nutrition claims keep label basis separate from consumed portion',()=>{
  const food={id:2,name:'yogurt',brand:null,defaultServingWeightGram:100,weightUnknown:false,
    kcalPerServing:100,proteinPerServing:20,carbPerServing:5,totalFatPerServing:0,
    satFatPerServing:null,transFatPerServing:null,fiberPerServing:null,
    sugarPerServing:null,addedSugarPerServing:null,Serving:[{id:9,foodItemId:2,
      servingName:'cup',servingWeightGram:100,defaultServingAmount:1}]};
  const originalText='两杯酸奶，每杯含20克蛋白质';
  const input={userId:'test',operationId:'test',messageId:50,originalText,
    consumedOn:'2026-09-24T08:00:00Z',submittedAt:'2026-09-24T08:00:00Z',
    timezone:'Asia/Shanghai',locale:'zh-CN',attachmentIds:[]};
  const item={foodId:2,quantity:{kind:'serving',servingId:9,amount:2},
    groupId:null,groupLabel:null,evidence:['food:2','serving:9']};
  const base={proposal:{schemaVersion:1,outcome:'resolved',consumedOn:input.consumedOn,
    items:[item],claims:[{sourceText:'每杯含20克蛋白质',nutrient:'proteinG',value:20,
      role:'label_identity',basis:'per_serving',relation:'equal',itemIndexes:[0]}],clarification:null},
    evidence:{events:new Map(),foods:new Map([[2,food]])},model:'fixture',provider:'test',
    durationMs:0,steps:0,toolCalls:1};
  assert.equal(compileMealPlan(input,base).items[0].nutrition.proteinG,40);
  assert.throws(()=>compileMealPlan(input,{...base,proposal:{...base.proposal,
    claims:[{...base.proposal.claims[0],role:'portion_target',basis:'consumed'}]}}),
    /nutrition_claim_conflicts_with_food/);
});
