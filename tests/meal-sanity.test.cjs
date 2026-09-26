require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compileMealPlan}=require('../src/mealResolution/compile');

// Deterministic meal sanity: whatever the model proposes, a published meal never
// drops a mentioned food, invents one, or counts the same food twice in a dish.
const food=(id,name,kcal,protein,carb,fat)=>({id,name,brand:null,lastUpdated:'2026-09-01T00:00:00Z',
  defaultServingWeightGram:100,weightUnknown:false,kcalPerServing:kcal,proteinPerServing:protein,
  carbPerServing:carb,totalFatPerServing:fat,satFatPerServing:null,transFatPerServing:null,
  fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,Serving:[]});
const catalogue=new Map([[1,food(1,'Chicken breast, cooked',165,31,0,3.6)],[2,food(2,'Olive oil',884,0,0,100)],
  [3,food(3,'White rice, cooked',130,2.7,28,0.3)],[4,food(4,'Egg, boiled',155,13,1.1,11)],[5,food(5,'Honey',304,0.3,82,0)]]);
const mass=(foodId,grams,groupId=null)=>({foodId,quantity:{kind:'mass',grams},groupId,groupLabel:groupId,evidence:[`food:${foodId}`]});
const mention=(sourceText,itemIndexes,extra={})=>({sourceText,itemIndexes,historySelectionIndexes:[],omitted:false,...extra});
const text='200 g chicken breast with 1 tbsp olive oil and 150 g rice';
const input=(originalText=text,attachmentIds=[])=>({userId:'u',operationId:'o',messageId:1,originalText,
  consumedOn:'2026-09-25T12:00:00Z',submittedAt:'2026-09-25T12:00:00Z',timezone:'UTC',locale:null,attachmentIds});
const compile=(items,components,{originalText,photoIds=[],historyGroupSelections=[],events=new Map(),barcodes=[]}={})=>
  compileMealPlan(input(originalText),{proposal:{schemaVersion:1,outcome:'resolved',consumedOn:'2026-09-25T12:00:00Z',
    historyGroupSelections,items,components,claims:[],clarification:null},
    evidence:{foods:catalogue,events},photoIds,barcodes,model:'fixture',provider:'test',durationMs:0,steps:1,toolCalls:1});
const complete=[mass(1,200),mass(2,13.5),mass(3,150)];
const covered=[mention('chicken breast',[0]),mention('olive oil',[1]),mention('rice',[2])];

test('a fully covered meal publishes each mentioned food exactly once',()=>{
  const plan=compile(complete,covered);
  assert.deepEqual(plan.items.map(i=>i.foodId),[1,2,3]);
  assert.equal(Math.round(plan.items.reduce((sum,i)=>sum+i.nutrition.kcal,0)),644);
});

test('a mentioned food with no item is a dropped ingredient',()=>{
  assert.throws(()=>compile([mass(1,200),mass(3,150)],[mention('chicken breast',[0]),mention('olive oil',[]),mention('rice',[1])]),
    /dropped_meal_mention/);
});

test('an item that no mention accounts for is an invented food',()=>{
  assert.throws(()=>compile(complete,[mention('chicken breast',[0]),mention('rice',[2])]),/uncovered_meal_item/);
});

test('the same food twice in one dish is a doubled ingredient, but separate dishes may share it',()=>{
  const eggs='2 eggs and 1 egg';
  assert.throws(()=>compile([mass(4,100),mass(4,50)],[mention('2 eggs',[0]),mention('1 egg',[1])],{originalText:eggs}),
    /duplicate_food_in_group/);
  const twoDishes='rice bowl and rice pudding';
  const plan=compile([mass(3,150,'bowl'),mass(3,100,'pudding')],[mention('rice bowl',[0]),mention('rice pudding',[1])],{originalText:twoDishes});
  assert.equal(plan.items.length,2);
});

test('one item cannot satisfy two mentions, and one mention cannot be listed twice',()=>{
  assert.throws(()=>compile(complete,[...covered,mention('chicken',[0])]),/item_coverage_conflict/);
  assert.throws(()=>compile(complete,[...covered,mention('Rice',[])]),/duplicate_meal_mention/);
});

test('mentions must come from the user text or an attached photo',()=>{
  assert.throws(()=>compile(complete,[mention('chicken breast',[0]),mention('olive oil',[1]),mention('basmati rice',[2])]),
    /unsupported_meal_mention/);
  const photoMention=[...covered.slice(0,2),mention('photo: bowl of white rice',[2])];
  assert.throws(()=>compile(complete,photoMention),/unsupported_meal_mention/);
  assert.equal(compile(complete,photoMention,{photoIds:[7]}).items.length,3);
});

test('explicit omissions add no food, and an omitted mention cannot carry one',()=>{
  const originalText='200 g chicken breast with 150 g rice, without honey';
  const base=[mass(1,200),mass(3,150)];
  const components=[mention('chicken breast',[0]),mention('rice',[1]),mention('honey',[],{omitted:true})];
  assert.deepEqual(compile(base,components,{originalText}).items.map(i=>i.foodId),[1,3]);
  assert.throws(()=>compile([...base,mass(5,20)],[components[0],components[1],mention('honey',[2],{omitted:true})],{originalText}),
    /omitted_mention_has_food/);
});

test('coverage is language independent and required',()=>{
  const originalText='鶏むね肉200gとご飯150g';
  assert.equal(compile([mass(1,200),mass(3,150)],[mention('鶏むね肉',[0]),mention('ご飯',[1])],{originalText}).items.length,2);
  assert.throws(()=>compile(complete,[]),/missing_meal_coverage/);
});

test('a referenced dish is covered by its history selection, not by retyped items',()=>{
  const row=(id,foodItemId)=>({id,updatedAt:'2026-09-24T12:00:00Z',foodItemId,name:`f${id}`,brand:null,grams:100,kcal:100,
    nutrition:{kcal:100,proteinG:5,carbG:10,totalFatG:2},servingId:null,servingAmount:null,loggedUnit:'g',groupId:'bowl'});
  const events=new Map([[9,{messageId:9,revision:1,originalText:'bowl',consumedOn:'2026-09-24T12:00:00Z',hasimages:false,
    foods:[row(91,1),row(92,3)],groups:[{id:'bowl',label:'Bowl'}]}]]);
  const historyGroupSelections=[{sourceMessageId:9,groupId:'bowl',scale:1,excludeLoggedFoodItemIds:[]}];
  const originalText='same bowl as yesterday';
  const plan=compile([],[mention('same bowl',[],{historySelectionIndexes:[0]})],{originalText,historyGroupSelections,events});
  assert.deepEqual(plan.items.map(i=>i.foodId),[1,3]);
  // Retyping a component of the referenced dish as a new item doubles it.
  assert.throws(()=>compile([{...mass(1,200,'bowl'),groupLabel:'Bowl'}],[mention('same bowl',[0],{historySelectionIndexes:[0]})],
    {originalText,historyGroupSelections,events}),/duplicate_food_in_group/);
  assert.throws(()=>compile([],[mention('same bowl',[])],{originalText,historyGroupSelections,events}),/dropped_meal_mention/);
});

test('a decoded barcode must be logged as the food that carries it, not a similar food',()=>{
  catalogue.set(30,{...food(30,'Protein Drink, Tropical Punch',53,7.2,3.9,1),gtin:'00818290015617'});
  catalogue.set(31,food(31,'Zero Sugar Greek Yogurt',40,7.3,2.7,0));
  const originalText='';
  const drink=[{foodId:30,quantity:{kind:'mass',grams:207},groupId:null,groupLabel:null,evidence:['gtin:00818290015617']}];
  const cup=[{foodId:31,quantity:{kind:'mass',grams:150},groupId:null,groupLabel:null,evidence:['gtin:00818290015617']}];
  const components=[mention('photo: Chobani drink',[0])];
  assert.equal(compile(drink,components,{originalText,photoIds:[1],barcodes:['00818290015617']}).items[0].foodId,30);
  assert.throws(()=>compile(cup,components,{originalText,photoIds:[1],barcodes:['00818290015617']}),/barcode_not_covered/);
  assert.equal(compile(cup,components,{originalText,photoIds:[1]}).items[0].foodId,31,'no barcode, no constraint');
});
