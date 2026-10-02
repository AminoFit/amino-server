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
  // A food that comes to know its sugars passes them on too (Iced Tea / Lemonade, imported without them).
  assert.deepEqual(fillsFor({...food,Nutrient:[],sugarPerServing:7.2},[{id:3,grams:240,sugarG:null,kcal:82}]),[{id:3,values:{sugarG:17.28}}]);
  assert.ok(!m.FILL_KEYS.includes('kcal')&&!m.FILL_KEYS.includes('proteinG'),'energy and macros are never filled');
  assert.equal(m.nutrientKey('Total Sugars'),'sugarG','USDA survey records\' sugar name');
  assert.deepEqual(staleLogs(food,[{id:1,grams:175,kcal:556},{id:2,grams:175,kcal:180},{id:3,grams:10,kcal:20}]).map(log=>log.id),[1],
    'the ceviche (556 for 175 g of a 1 kcal/g food) is stale; small gaps are not');
});

test('a fish oil panel\'s EPA and DHA lines are its omega-3 (a printed total wins)',()=>{
  assert.deepEqual(m.microsFrom([{name:'EPA (eicosapentaenoic acid)',amount:700,unit:'mg'},{name:'DHA (docosahexaenoic acid)',amount:500,unit:'mg'},
    {name:'Cholesterol',amount:5,unit:'mg'}]),{cholesterolMg:5,omega3Mg:1200});
  assert.equal(m.microsFrom([{name:'Total Omega-3 Fatty Acids',amount:1300,unit:'mg'},{name:'EPA',amount:700,unit:'mg'}]).omega3Mg,1300);
});

test('USDA records: RAE over IU, folate total when no DFE, a measured 0 kept, linoleic and linolenic totals as omega-6 and -3',()=>{
  const {extractFoodInfo,foodAttributesToQuery}=require('../src/FoodDbThirdPty/USDA/getFoodInfo.ts');
  const row=(name,amount,unitName='µg')=>({nutrient:{name,unitName},amount});
  const read=rows=>extractFoodInfo({description:'Food',dataType:'SR Legacy',fdcId:1,foodNutrients:rows},foodAttributesToQuery).foodInfo;
  // Blueberries (SR Legacy 171711) list IU first: 54 IU per 100 g are 3 µg RAE, never 54 µg or 16 µg.
  const berries=read([row('Vitamin A, IU',54,'IU'),row('Vitamin A, RAE',3),row('Vitamin D (D2 + D3)',0),
    row('PUFA 18:2',0.088,'g'),row('PUFA 18:3',0.058,'g')]);
  assert.equal(berries.vitaminA.amount,3);
  assert.equal(berries.vitaminD.amount,0,'a measured 0 is a value, not missing');
  assert.equal(berries.omega6.amount,88);assert.equal(berries.omega3.amount,58);
  // An IU-only record leaves vitamin A unknown: retinol or beta-carotene can't be told apart.
  assert.equal(read([row('Vitamin A, IU',417,'IU')]).vitaminA,undefined);
  // Baby spinach (Foundation 1999632) gives only the total folate.
  assert.equal(read([row('Folate, total',116.5)]).folate.amount,116.5);
  assert.equal(read([row('Folate, total',150),row('Folate, DFE',190)]).folate.amount,190,'DFE first');
  // An egg's 18:2 split into n-6 and CLAs: the split counts, not the total as well.
  const egg=read([row('PUFA 18:2',1.555,'g'),row('PUFA 18:2 n-6 c,c',1.531,'g'),row('PUFA 20:4',0.188,'g')]);
  assert.equal(egg.omega6.amount,1719);
});

test('vitamin A in IU is unknown wherever it comes from; D and E convert',()=>{
  assert.equal(m.inKeyUnit('vitaminAMcg',54,'IU'),null);
  assert.equal(m.nutrientKey('Vitamin A, IU'),null);
  assert.equal(m.inKeyUnit('vitaminEMg',10,'IU'),6.7);
});

test('a recipe is its ingredients\' sum, recomputed when one gains a value',()=>{
  const {valuesDiffer}=require('../src/userFoods/recipeRefresh.ts');
  const food=(kcal,rows)=>({defaultServingWeightGram:100,kcalPerServing:kcal,proteinPerServing:1,carbPerServing:1,totalFatPerServing:1,
    Nutrient:rows.map(([nutrientName,nutrientAmountPerDefaultServing])=>({nutrientName,nutrientUnit:'mcg',nutrientAmountPerDefaultServing}))});
  // Recipe 15315: the chicken knew vitamin A, the sauce only later.
  const chicken=food(160,[['vitaminA',26.8]]),sauce=food(48,[]);
  const before=m.recipeValues([{food:chicken,grams:227},{food:sauce,grams:108.7}],1).perPortion;
  sauce.Nutrient.push({nutrientName:'vitaminA',nutrientUnit:'mcg',nutrientAmountPerDefaultServing:241.9});
  const after=m.recipeValues([{food:chicken,grams:227},{food:sauce,grams:108.7}],1).perPortion;
  assert.equal(Math.round(before.vitaminAMcg*10)/10,60.8);
  assert.equal(Math.round(after.vitaminAMcg*10)/10,323.8);
  assert.equal(valuesDiffer(before,after),true);
  assert.equal(valuesDiffer(after,{...after}),false);
});
