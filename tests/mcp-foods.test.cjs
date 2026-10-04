require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {foodCard,passesFilters}=require('../src/mcp/foods');

// Food cards for agents (src/mcp/foods.ts): what an agent needs to log a food without another lookup.
const bar={id:5,name:'Protein bar',brand:'Barebells',foodInfoSource:'Online',privateToUserId:null,archivedAt:null,
  recipePortions:null,isLiquid:false,defaultServingWeightGram:55,weightUnknown:false,kcalPerServing:200,proteinPerServing:20,
  carbPerServing:16,totalFatPerServing:7.5,sugarPerServing:1.4,fiberPerServing:null,
  Serving:[{id:11,servingName:'bar',servingWeightGram:55,defaultServingAmount:1},{id:12,servingName:'box',servingWeightGram:660,
    defaultServingAmount:1},{id:13,servingName:'broken',servingWeightGram:null,defaultServingAmount:1}],
  Nutrient:[{nutrientName:'Sodium, Na',nutrientUnit:'g',nutrientAmountPerDefaultServing:0.22}]};

test('a card has servings by id, values per 100 g and per serving, and leaves out what the food does not record',()=>{
  const card=foodCard(bar,'me');
  assert.equal(card.source,'catalogue');
  assert.deepEqual(card.servings,[{servingId:11,unit:'bar',gramsPerUnit:55},{servingId:12,unit:'box',gramsPerUnit:660}]);
  assert.deepEqual(card.perServing,{serving:'1 bar (55 g)',kcal:200,proteinG:20,carbG:16,totalFatG:7.5,sugarG:1.4,sodiumMg:220});
  assert.equal(card.per100g.kcal,364);
  assert.equal(card.per100g.proteinG,36.4);
  assert.equal('fiberG' in card.per100g,false,'unknown fibre is absent, not 0');
  assert.equal(card.estimate,undefined);
});

test('own foods, recipes, estimates and the user\'s history are marked',()=>{
  assert.equal(foodCard({...bar,privateToUserId:'me'},'me').source,'custom');
  const recipe=foodCard({...bar,privateToUserId:'me',recipePortions:4,Serving:[{id:20,servingName:'portion',servingWeightGram:55,
    defaultServingAmount:1}]},'me');
  assert.equal(recipe.source,'recipe');
  assert.equal(recipe.portions,4);
  assert.equal(recipe.perServing.serving,'1 portion (55 g)');
  assert.equal(foodCard({...bar,foodInfoSource:'AgentEstimate'},'me').estimate,true);
  const logged=foodCard(bar,'me',{foodId:5,timesLogged:3,lastLoggedOn:'2026-10-01',usualServingId:11,usualAmount:2,
    usualUnit:'bar',usualGrams:110});
  assert.deepEqual(logged.usual,{servingId:11,amount:2,unit:'bar',grams:110});
  assert.deepEqual(foodCard(bar,'me',{foodId:5,timesLogged:1,lastLoggedOn:'2026-10-01',usualServingId:null,usualAmount:null,
    usualUnit:'g',usualGrams:42.25}).usual,{grams:42.3});
  assert.equal(foodCard({...bar,weightUnknown:true},'me').nutritionUnknown,true);
});

test('filters are per 100 g, and a food with unknown energy never passes one',()=>{
  const card=foodCard(bar,'me');
  assert.equal(passesFilters(card,undefined),true);
  assert.equal(passesFilters(card,{minProteinG:30}),true);
  assert.equal(passesFilters(card,{minProteinG:40}),false);
  assert.equal(passesFilters(card,{maxKcal:300}),false);
  assert.equal(passesFilters(card,{maxFatG:20,maxCarbG:30}),true);
  assert.equal(passesFilters(foodCard({...bar,weightUnknown:true},'me'),{maxKcal:1000}),false);
});

test('values keep their precision: milligrams and micrograms to three significant figures, as the database rounds',()=>{
  const {nutrientRound}=require('../src/nutrition');
  assert.equal(nutrientRound('vitaminB1Mg',0.395),0.395,'not 0');
  assert.equal(nutrientRound('vitaminEMg',0.015),0.015);
  assert.equal(nutrientRound('sodiumMg',2312.7),2313);
  assert.equal(nutrientRound('vitaminB12Mcg',2.4321),2.43);
  assert.equal(nutrientRound('proteinG',12.345),12.3);
  assert.equal(nutrientRound('kcal',105.4),105);
  assert.equal(nutrientRound('zincMg',0.0001),0);
  const card=foodCard({...bar,Nutrient:[...bar.Nutrient,{nutrientName:'Thiamin',nutrientUnit:'mg',nutrientAmountPerDefaultServing:0.2}]},'me',undefined,true);
  assert.equal(card.per100g.vitaminB1Mg,0.364,'a small per-100 g value isn\'t rounded away');
});
