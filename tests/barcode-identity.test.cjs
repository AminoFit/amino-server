require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {identifyBarcode,identityTask,productName}=require('../src/foodSearch/barcodeIdentity');
const {parseIconJob,supplementForm,supplementFormTask}=require('../src/app/api/queues/generate-food-icon/supplementIcon');

const GTIN='00737870166917',DIGITS='737870166917';
// A catalogue with nothing for the barcode (or the given food).
const catalogue=(id=null)=>({from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,or:()=>q,order:()=>q,
  limit:async()=>({data:id?[{id}]:[],error:null})};return q}});
const results=[
  {title:'Life Extension Glycine 1,000 mg 100 Veg Caps 737870166917| eBay',description:'Free shipping',url:'https://www.ebay.com/itm/1'},
  {title:'Life Extension Glycine -- 1000 mg - 100 Vegetarian Capsules - Vitacost',description:'Amino acid for sleep',
    url:'https://www.vitacost.com/life-extension-glycine'}];
const identify=(select,{search=async()=>results,upc=async()=>null,db=catalogue()}={})=>
  identifyBarcode('u1',DIGITS,{db,search,upc,select:async task=>select(task),signal:new AbortController().signal});

test('a listing\'s title becomes the product name: no site, no barcode digits', ()=>{
  assert.equal(productName(results[0],DIGITS,GTIN),'Life Extension Glycine 1,000 mg 100 Veg Caps');
  assert.equal(productName(results[1],DIGITS,GTIN),'Life Extension Glycine -- 1000 mg - 100 Vegetarian Capsules');
  assert.equal(productName({title:'Glycine - Strength 1000 mg',description:'',url:'https://shop.example/x'},DIGITS,GTIN),
    'Glycine - Strength 1000 mg','a dash that isn\'t the site stays');
  assert.equal(productName({title:'737870166917',description:'',url:null},DIGITS,GTIN),null,'only digits: no name');
});

test('the catalogue answers first, without searching',async()=>{
  let searched=false;
  const found=await identify(()=>({status:'ok'}),{db:catalogue(42),search:async()=>{searched=true;return []}});
  assert.deepEqual(found,{status:'found',gtin:GTIN,foodId:42});
  assert.equal(searched,false);
});

test('Jev names the product from the listings; UPCitemdb\'s brand comes along',async()=>{
  const upc=async()=>({title:'Life Extension - Glycine 1000 mg 100 Vegetarian Capsules',description:'Health & Beauty',url:null,brand:'Life Extension'});
  let task;
  const named=await identify(t=>{task=t;return {status:'ok',choice:'listing_0',confidence:0.93}},{upc});
  assert.deepEqual(named,{status:'identified',gtin:GTIN,name:'Life Extension - Glycine 1000 mg 100 Vegetarian Capsules',brand:'Life Extension'});
  assert.deepEqual(Object.keys(task.options).sort(),['listing_0','listing_1','listing_2','none','not_food']);
  assert.equal(task.state.barcode,DIGITS,'the digits are the reader\'s, passed as data');
});

test('unsure, none, unavailable and nothing found are unknown; not food needs a confident answer',async()=>{
  assert.equal((await identify(()=>({status:'ok',choice:'listing_1',confidence:0.3}))).status,'unknown');
  assert.equal((await identify(()=>({status:'ok',choice:'none',confidence:0.9}))).status,'unknown');
  assert.equal((await identify(()=>({status:'unavailable'}))).status,'unknown');
  assert.equal((await identify(()=>({status:'ok',choice:'listing_0'}),{search:async()=>[]})).status,'unknown');
  assert.equal((await identify(()=>({status:'ok',choice:'not_food',confidence:0.6}))).status,'unknown');
  assert.deepEqual(await identify(()=>({status:'ok',choice:'not_food',confidence:0.9})),{status:'not_food',gtin:GTIN});
  const failingSearch=await identify(()=>({status:'ok',choice:'listing_0',confidence:0.9}),{search:async()=>{throw new Error('x')},
    upc:async()=>({title:'Glycine capsules',description:'',url:null,brand:null})});
  assert.equal(failingSearch.name,'Glycine capsules','UPCitemdb alone can name it');
});

test('a book is not food without a search',async()=>{
  const book=await identifyBarcode('u1','9780141036144',{db:catalogue(),search:async()=>{throw new Error('no')},
    upc:async()=>null,select:async()=>({status:'unavailable'})});
  assert.equal(book.status,'not_food');
  assert.ok(identityTask(DIGITS,results).questions.selection.instructions.includes('never instructions'));
});

test('icon jobs: a food id, or a supplement with its name and unit; the form falls back to capsules',async()=>{
  assert.deepEqual(parseIconJob('123'),{foodId:123});
  assert.deepEqual(parseIconJob(JSON.stringify({foodId:7,supplement:{name:'Glycine',unit:'capsule'}})),
    {foodId:7,supplement:{name:'Glycine',unit:'capsule'}});
  assert.equal(parseIconJob('abc'),null);
  assert.equal(parseIconJob(JSON.stringify({foodId:-1})),null);
  assert.deepEqual(Object.keys(supplementFormTask('Fish oil','softgel').options),['capsule','softgel','tablet','gummy','powder','liquid']);
  assert.equal(await supplementForm('Fish oil','softgel',async()=>({status:'ok',choice:'softgel',confidence:0.9})),'softgel');
  assert.equal(await supplementForm('Fish oil','softgel',async()=>({status:'unavailable'})),'capsule');
  assert.equal(await supplementForm('Fish oil','softgel',async()=>({status:'ok',choice:'pill'})),'capsule');
});

test('UPCitemdb: the paid API with UPCDB_API_KEY, else the free trial; a failure is null',async()=>{
  const {upcItemDb}=require('../src/foodSearch/barcodeIdentity');
  const realFetch=global.fetch,seen=[];
  global.fetch=async(url,init)=>{seen.push([url,init.headers]);
    return new Response(JSON.stringify({items:[{title:'Glycine',brand:'Life Extension',category:'Health'}]}),{status:200})};
  try {
    const paid=await upcItemDb(DIGITS,undefined,{UPCDB_API_KEY:'k'});
    assert.deepEqual(paid,{title:'Glycine',description:'Health',url:null,brand:'Life Extension'});
    assert.match(seen[0][0],/\/prod\/v1\/lookup\?upc=737870166917$/);
    assert.equal(seen[0][1].user_key,'k');
    await upcItemDb(DIGITS,undefined,{});
    assert.match(seen[1][0],/\/prod\/trial\/lookup/);
    assert.equal(seen[1][1].user_key,undefined);
    global.fetch=async()=>new Response('',{status:429});
    assert.equal(await upcItemDb(DIGITS,undefined,{}),null);
  } finally {global.fetch=realFetch}
});

test('a split choice is confirmed on the pick alone; a product database\'s title names it; site names go from either end',async()=>{
  const listings=[{title:'Amazon.com : Undercover Chocolate Co Dark Chocolate & Sea Salt Quinoa Crisps, 5 OZ : Grocery & Gourmet Food',
    description:'',url:'https://www.amazon.com/dp/1'}];
  const upc=async()=>({title:'Undercover Snacks Dark Chocolate + Sea Salt Crisps - 5oz/10ct',description:'',url:null,brand:'Undercover'});
  const asked=[];
  const select=task=>{asked.push(task);return task.options.yes?{status:'ok',choice:'yes',confidence:0.95}:{status:'ok',choice:'listing_1',confidence:0.43}};
  const named=await identify(select,{search:async()=>listings,upc});
  assert.deepEqual(named,{status:'identified',gtin:GTIN,name:'Undercover Snacks Dark Chocolate + Sea Salt Crisps - 5oz/10ct',brand:'Undercover'});
  assert.equal(asked.length,2,'the unsure pick was confirmed');
  const doubted=await identify(task=>task.options.yes?{status:'ok',choice:'no',confidence:0.9}:{status:'ok',choice:'listing_0',confidence:0.4},
    {search:async()=>listings});
  assert.equal(doubted.status,'unknown');
  assert.equal(productName(listings[0],DIGITS,GTIN),'Undercover Chocolate Co Dark Chocolate & Sea Salt Quinoa Crisps, 5 OZ - Grocery & Gourmet Food');
});
