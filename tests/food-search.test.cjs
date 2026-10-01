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
