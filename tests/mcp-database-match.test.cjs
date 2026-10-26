require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {databaseMatch}=require('../src/mcp/databaseMatch');

// create_food asks the shared catalogue and USDA first (src/mcp/databaseMatch.ts).

/** Shared catalogue rows by id; barcodes map to a catalogue food. */
function fakeDb(rows,gtins={}){
  return {from(table){
    const q={filters:{}};
    const builder={select:()=>builder,or:()=>builder,order:()=>builder,limit:()=>builder,
      eq:(key,value)=>{q.filters[key]=value;return builder},is:()=>builder,in:(key,values)=>{q.filters[key]=values;return builder},
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        if (table==='FoodBarcode') return {data:[],error:null};
        if ('gtin' in q.filters) {const id=gtins[q.filters.gtin];return {data:id?[{id,privateToUserId:null}]:[],error:null}}
        return {data:rows.filter(row=>q.filters.id.includes(row.id)),error:null};
      }).then(resolve,reject)};
    return builder;
  }};
}
const pinot={name:'Pinot Noir wine (USDA)',brand:null,gtin:null,kcal:120.54,proteinG:0.1,servingGrams:148};
const usdaPinot={fdcId:174835,name:'Alcoholic Beverage, Wine, Table, Red, Pinot Noir',brand:null,servingGrams:100,kcal:82,proteinG:0.07};
const redWine={id:10697,name:'Wine, Table, Red',brand:'',kcalPerServing:85,proteinPerServing:0.07,defaultServingWeightGram:100};
const search=results=>async()=>({results});

test('a food USDA has is named instead of created, from the same duplicate policy',async()=>{
  let task;
  const match=await databaseMatch('u1',pinot,{db:fakeDb([redWine]),search:search([{id:10697,source:'catalogue',match:'name'}]),
    usda:async()=>[usdaPinot],jev:async t=>{task=t;return {status:'ok',choice:'usda_174835',confidence:0.95}}});
  assert.deepEqual(match,{kind:'usda',usdaId:174835,name:usdaPinot.name,brand:null});
  assert.deepEqual(task.state.catalogue.map(c=>c.id),['food_10697','usda_174835']);
  assert.equal(task.state.newFood.kcalPer100g,81.4,'compared per 100 g');
});

test('an unsure or unavailable check creates the food',async()=>{
  for (const decision of [{status:'ok',choice:'usda_174835',confidence:0.7},{status:'ok',choice:'none',confidence:0.95},
    {status:'unavailable'}]) {
    const match=await databaseMatch('u1',pinot,{db:fakeDb([]),search:search([]),usda:async()=>[usdaPinot],jev:async()=>decision});
    assert.equal(match,null);
  }
  const failed=await databaseMatch('u1',pinot,{db:fakeDb([]),search:search([]),usda:async()=>{throw new Error('usda down')},
    jev:async()=>{throw new Error('not asked')}});
  assert.equal(failed,null,'the fallback never depends on the check');
});

test('a restaurant dish is only compared with its brand\'s foods, and a generic food with generic ones',async()=>{
  let asked=false;
  const dish=await databaseMatch('u1',{name:'Tzatziki',brand:'CAVA',kcal:70,proteinG:2,servingGrams:57},{db:fakeDb([
    {id:5,name:'Tzatziki',brand:'',kcalPerServing:90,proteinPerServing:4,defaultServingWeightGram:100}]),
    search:search([{id:5,source:'catalogue',match:'name'},{id:6,source:'custom',match:'name'}]),
    usda:async()=>[{fdcId:1,name:'Tzatziki dip',brand:null,servingGrams:100,kcal:90,proteinG:4}],
    jev:async()=>{asked=true;return {status:'ok',choice:'food_5',confidence:0.99}}});
  assert.equal(dish,null);
  assert.equal(asked,false,'no candidate of the same brand: nothing to ask');

  let candidates;
  await databaseMatch('u1',pinot,{db:fakeDb([]),search:search([]),
    usda:async()=>[usdaPinot,{fdcId:9,name:'Pinot Noir',brand:'Meiomi',servingGrams:150,kcal:125,proteinG:0}],
    jev:async t=>{candidates=t.state.catalogue.map(c=>c.id);return {status:'ok',choice:'none',confidence:0.95}}});
  assert.deepEqual(candidates,['usda_174835'],'a branded record is never a generic food');
});

test('a barcode the catalogue has decides without a model',async()=>{
  const match=await databaseMatch('u1',{...pinot,gtin:'04809010272010'},{db:fakeDb([{...redWine,id:42,name:'Mango',brand:'7D'}],
    {'04809010272010':42}),search:async()=>{throw new Error('not searched')},jev:async()=>{throw new Error('not asked')}});
  assert.deepEqual(match,{kind:'catalogue',foodId:42,name:'Mango',brand:'7D'});
});
