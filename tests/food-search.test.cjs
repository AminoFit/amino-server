require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prefixMatch,MEANING_FLOOR}=require('../src/foodSearch/searchFoods');

test('your own foods match on word prefixes: a partial name still finds them',()=>{
  assert.equal(prefixMatch('pas sau',{name:'Chicken Pasta Sauce - 9/30/26',brand:null}),true);
  assert.equal(prefixMatch('quinoa',{name:'Dark Chocolate Quinoa Crisps',brand:'Undercover'}),true);
  assert.equal(prefixMatch('undercover crisps',{name:'Dark Chocolate Quinoa Crisps',brand:'Undercover'}),true);
  assert.equal(prefixMatch('crème',{name:'Creme brulee',brand:null}),true,'accents and case are ignored');
  assert.equal(prefixMatch('pasta bake',{name:'Chicken Pasta Sauce',brand:null}),false,'every word must match');
  assert.equal(prefixMatch('',{name:'Anything',brand:null}),false);
});

test('meaning-only catalogue rows need a close match',()=>{
  // BGE scores unrelated foods 0.65-0.73 ("Chives" for "chiken brest"); real matches score 0.74 and up.
  assert.equal(MEANING_FLOOR,0.75);
});

test('a scanned barcode finds the user\'s food first, then the catalogue\'s, then a source record; a bad code is refused',async()=>{
  const {foodForBarcode}=require('../src/foodSearch/barcodeLookup');
  const dbWith=rows=>({from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:rows,error:null})};return q}});
  const noSources={async barcodeSources(){throw new Error('not reached')},async createFoodFromSource(){throw new Error('not reached')}};
  assert.deepEqual(await foodForBarcode('u1','4809010272010',{db:dbWith([{id:77}]),sources:noSources}),
    {status:'found',gtin:'04809010272010',foodId:77,created:false},'a 13-digit code is normalised to GTIN-14');
  const created=[];
  const sources={async barcodeSources(gtin){return [{sourceId:'off:0',gtin}]},async createFoodFromSource(id){created.push(id);return {status:'created',foodId:99}}};
  assert.deepEqual(await foodForBarcode('u1','04809010272010',{db:dbWith([]),sources}),
    {status:'found',gtin:'04809010272010',foodId:99,created:true});
  assert.deepEqual(created,['off:0']);
  const none={async barcodeSources(){return []},async createFoodFromSource(){throw new Error('not reached')}};
  assert.deepEqual(await foodForBarcode('u1','04809010272010',{db:dbWith([]),sources:none}),{status:'unknown',gtin:'04809010272010'});
  await assert.rejects(foodForBarcode('u1','4809010272011',{db:dbWith([]),sources:none}),/invalid_barcode/,'a wrong check digit');
});
