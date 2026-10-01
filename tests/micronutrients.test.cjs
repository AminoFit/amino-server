require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../src/foodResolution/micronutrients.ts');

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
