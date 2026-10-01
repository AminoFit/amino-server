require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../src/nutrition/index.ts');

test('nutrient names in every source\'s wording map to one key, and units convert to the key\'s',()=>{
  for (const [name,key] of [['Magnesium, Mg','magnesiumMg'],['magnesium','magnesiumMg'],['magnesiumMg','magnesiumMg'],
    ['Magnesium (as magnesium glycinate)','magnesiumMg'],['Vitamin B12 (as cyanocobalamin)','vitaminB12Mcg'],['Folate (DFE)','vitaminB9Mcg'],
    ['Vitamin B2 (Riboflavin)','vitaminB2Mg'],['Iron','ironMg'],['Glycine',null]]) assert.equal(m.nutrientKey(name),key,name);
  assert.equal(m.inKeyUnit('vitaminDMcg',400,'IU'),10);
  assert.equal(m.inKeyUnit('magnesiumMg',0.12,'g'),120);
  assert.equal(m.inKeyUnit('vitaminAMcg',5,'μg'),5);
  assert.equal(m.inKeyUnit('ironMg',5,'cups'),null,'an unknown unit is dropped, not guessed');
  assert.deepEqual(m.microsFrom([{name:'Magnesium',amount:120,unit:'mg'},{name:'Calories',amount:5,unit:'kcal'},{name:'Glycine',amount:1000,unit:'mg'}]),
    {magnesiumMg:120},'macros and unknown lines are not micronutrients');
});

test('Open Food Facts keeps micronutrients in grams per 100 g; rows are written the catalogue\'s way',()=>{
  const per100=m.offMicrosPer100g({magnesium_100g:12,sodium_100g:'0.4','vitamin-d_100g':0.00001,iron_100g:''});
  assert.deepEqual(Object.keys(per100).sort(),['magnesiumMg','sodiumMg','vitaminDMcg']);
  assert.equal(per100.magnesiumMg,12000);
  assert.deepEqual(m.microRows({magnesiumMg:120}),[{nutrientName:'magnesium',nutrientUnit:'mg',nutrientAmountPerDefaultServing:120}]);
});

test('logs follow their food: empty vitamins fill from the food, and calories that no longer match are stale',()=>{
  const {fillsFor,staleLogs}=require('../src/mealOperations/logRefresh.ts');
  const food={defaultServingWeightGram:100,kcalPerServing:100,proteinPerServing:20,carbPerServing:5,totalFatPerServing:0,
    Nutrient:[{nutrientName:'Magnesium, Mg',nutrientUnit:'mg',nutrientAmountPerDefaultServing:30},{nutrientName:'potassium',nutrientUnit:'mg',nutrientAmountPerDefaultServing:400}]};
  assert.deepEqual(fillsFor(food,[{id:1,grams:50,magnesiumMg:null,potassiumMg:999},{id:2,grams:200,magnesiumMg:60,potassiumMg:800}]),
    [{id:1,values:{magnesiumMg:15}}],'only empty columns, scaled by grams; a full log is left alone');
  assert.deepEqual(staleLogs(food,[{id:1,grams:175,kcal:556},{id:2,grams:175,kcal:180},{id:3,grams:10,kcal:20}]).map(log=>log.id),[1],
    'the ceviche (556 for 175 g of a 1 kcal/g food) is stale; small gaps are not');
});

test('a fish oil panel\'s EPA and DHA lines are its omega-3 (a printed total wins)',()=>{
  assert.deepEqual(m.microsFrom([{name:'EPA (eicosapentaenoic acid)',amount:700,unit:'mg'},{name:'DHA (docosahexaenoic acid)',amount:500,unit:'mg'},
    {name:'Cholesterol',amount:5,unit:'mg'}]),{cholesterolMg:5,omega3Mg:1200});
  assert.equal(m.microsFrom([{name:'Total Omega-3 Fatty Acids',amount:1300,unit:'mg'},{name:'EPA',amount:700,unit:'mg'}]).omega3Mg,1300);
});
