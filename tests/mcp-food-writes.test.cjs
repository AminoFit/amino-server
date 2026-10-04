require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {currentFoodFields}=require('../src/mcp/foodWrites');
const {customFoodInput}=require('../src/userFoods/userFoods');

// An agent's edit changes only the fields it passes: the rest come from the food as saved (src/mcp/foodWrites.ts).
const saved={id:9,name:'Protein bar',brand:'Barebells',gtin:'07350068950070',isLiquid:false,privateToUserId:'me',archivedAt:null,
  recipePortions:null,defaultServingWeightGram:55,
  Serving:[{id:1,servingName:'bar',servingWeightGram:55,defaultServingAmount:1},{id:2,servingName:'box',servingWeightGram:660,
    defaultServingAmount:1}],
  perServing:{kcal:200,proteinG:20,carbG:16,totalFatG:7.5,sugarG:1.4,sodiumMg:220.0004}};

test('a saved food reads back as the fields that would save it again',()=>{
  const fields=currentFoodFields(saved);
  assert.deepEqual(fields.serving,{unit:'bar',amount:1,grams:55});
  assert.deepEqual(fields.extraServings,[{unit:'box',amount:1,grams:660}]);
  assert.deepEqual([fields.kcal,fields.proteinG,fields.carbG,fields.totalFatG,fields.sugarG,fields.fiberG],[200,20,16,7.5,1.4,null]);
  assert.deepEqual(fields.nutrients,{sodiumMg:220},'micronutrients carry over (rounded)');
  assert.equal(fields.barcode,'07350068950070','the barcode moves to a new version');
  const {barcode,...rest}=fields;
  assert.doesNotThrow(()=>customFoodInput.parse({...rest,gtin:barcode}),'the Foods tab accepts it as is');
});

test('a food saved without a named serving reads back by weight',()=>{
  const fields=currentFoodFields({...saved,gtin:null,Serving:[],perServing:{kcal:120,proteinG:3,carbG:20,totalFatG:2}});
  assert.deepEqual(fields.serving,{unit:'g',amount:55,grams:55});
  assert.equal(fields.barcode,undefined);
});

test('a meal food has exactly one amount',()=>{
  const {mealFood,quantityFrom}=require('../src/mcp/mealWrites');
  assert.equal(mealFood.safeParse({foodId:1,grams:100}).success,true);
  assert.equal(mealFood.safeParse({foodId:1,servingId:4,amount:2}).success,true);
  assert.equal(mealFood.safeParse({foodId:1,portions:1.5}).success,true);
  assert.equal(mealFood.safeParse({foodId:1}).success,false,'no amount');
  assert.equal(mealFood.safeParse({foodId:1,grams:100,portions:1}).success,false,'two amounts');
  assert.equal(mealFood.safeParse({foodId:1,servingId:4}).success,false,'a serving needs an amount');
  assert.deepEqual(quantityFrom({servingId:4,amount:2}),{servingId:4,amount:2});
  assert.deepEqual(quantityFrom({grams:100}),{grams:100});
  assert.deepEqual(quantityFrom({portions:1.5}),{portions:1.5});
});
