require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {addCatalogueFood,pointerFrom,changesBetween}=require('../src/mcp/catalogueAdds');
const {McpInputError}=require('../src/mcp/meals');

// Agents add shared catalogue foods from a USDA id or a barcode (src/mcp/catalogueAdds.ts,
// 2026-10-05-mcp-catalogue-adds-plan.md).

const agent={clientId:'client-1',name:'Claude'};
const gtin='04809010272010';

/** The admin database the tool reads: foods by barcode or USDA id, food snapshots, and CatalogueAgentChange rows (`at`
 * backdates a seeded row). Any other query fails the test. */
function fakeDb(state){
  state.changes??=[];state.foods??={};state.gtins??={};state.usda??={};
  const answer=q=>{
    if (q.table==='CatalogueAgentChange') {
      const since=Date.parse(q.filters.createdAt);
      return {count:state.changes.filter(row=>(row.at??Date.now())>=since).length,error:null};
    }
    if (q.table==='FoodBarcode') return {data:[],error:null};
    if (q.table==='FoodItem'&&'gtin' in q.filters) {const id=state.gtins[q.filters.gtin];return {data:id?[{id,privateToUserId:null}]:[],error:null}}
    if (q.table==='FoodItem'&&'externalId' in q.filters) {const id=state.usda[q.filters.externalId];return {data:id?[{id}]:[],error:null}}
    throw new Error(`unexpected query ${JSON.stringify(q)}`);
  };
  return {from(table){
    const q={table,filters:{}};
    const builder={select:()=>builder,or:()=>builder,order:()=>builder,limit:()=>builder,
      eq:(key,value)=>{q.filters[key]=value;return builder},is:(key,value)=>{q.filters[key]=value;return builder},
      gte:(key,value)=>{q.filters[key]=value;return builder},
      insert:async rows=>{state.changes.push(...rows);return {error:null}},
      maybeSingle:async()=>({data:structuredClone(state.foods[q.filters.id]??null),error:null}),
      then:(resolve,reject)=>Promise.resolve().then(()=>answer(q)).then(resolve,reject)};
    return builder;
  }};
}

const food=(id,extra={})=>({id,name:'Popcorn',brand:'Skinny Pop',gtin:null,kcalPerServing:150,knownAs:null,
  lastUpdated:'2026-10-01',bgeBaseEmbedding:'[0.1]',Serving:[{id:1,servingName:'cup',servingWeightGram:28}],FoodBarcode:[],
  Nutrient:[{nutrientName:'Iron',nutrientUnit:'mg',nutrientAmountPerDefaultServing:0.5}],...extra});
const card=async(_db,_user,foodId,servingId)=>({id:foodId,...(servingId!=null?{barcodePackage:{servingId}}:{})});
const notCalled=name=>async()=>{throw new Error(`${name} should not be called`)};

test('a barcode Amino already has is found without asking a source or counting against the limits',async()=>{
  const state={gtins:{[gtin]:15},changes:Array.from({length:60},()=>({}))};
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:notCalled('barcode lookup'),sources:notCalled('sources')});
  assert.deepEqual(result.data,{status:'found',food:{id:15}});
  assert.deepEqual(result.targets,[15]);
  assert.equal(state.changes.length,60,'no row written');
});

test('a new barcode is added from a database with the web off, and the addition is recorded with the agent',async()=>{
  const state={};
  let options;
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:async(_user,code,opts)=>{options=opts;assert.equal(code,gtin);
      return {status:'found',gtin,foodId:99,created:true,source:{kind:'Online',ref:`off:${gtin}`}}}});
  assert.equal(options.web,false,'an agent\'s digits never go to the web search');
  assert.deepEqual(result.data,{status:'added',food:{id:99},source:`Open Food Facts ${gtin}`});
  assert.deepEqual(state.changes,[{userId:'u1',clientId:'client-1',agentName:'Claude',sourceKind:'OpenFoodFacts',
    sourceRef:gtin,foodItemId:99,action:'created'}]);
});

test('an existing food that a barcode enriches keeps its state before, for repair',async()=>{
  const state={foods:{15:food(15)}};
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:async(_user,_code,{beforeChange})=>{
      await beforeChange(15);
      state.foods[15]=food(15,{gtin,lastUpdated:'2026-10-05',Serving:[...food(15).Serving,{id:2,servingName:'bag',servingWeightGram:126}]});
      return {status:'found',gtin,foodId:15,created:false,source:{kind:'USDA',ref:'2345678'}};
    }});
  assert.deepEqual(result.data,{status:'found',food:{id:15},source:'USDA FoodData Central 2345678'});
  const [row]=state.changes;
  assert.equal(state.changes.length,1);
  assert.equal(row.action,'enriched');
  assert.equal(row.sourceKind,'USDA');
  assert.deepEqual(row.changes.fields,{gtin:{before:null,after:gtin}},'lastUpdated is not a change');
  assert.deepEqual(row.changes.servingsAdded,[2]);
  assert.equal(row.before.gtin,null);
  assert.equal(row.before.bgeBaseEmbedding,undefined,'embeddings are left out');
});

test('a barcode that only adds a package size is recorded as such',async()=>{
  const state={foods:{15:food(15,{gtin:'00856312002795'})}};
  await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:async(_user,_code,{beforeChange})=>{
      await beforeChange(15);
      state.foods[15]={...state.foods[15],FoodBarcode:[{gtin,servingId:1,source:'Online'}]};
      return {status:'found',gtin,foodId:15,created:false,source:{kind:'Online',ref:`off:${gtin}`}};
    }});
  assert.equal(state.changes[0].action,'package_barcode');
  assert.deepEqual(state.changes[0].changes.barcodesAdded,[gtin]);
});

test('a barcode no database knows adds nothing',async()=>{
  const state={};
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:async()=>({status:'unknown',gtin}),name:async()=>({status:'unknown',gtin})});
  assert.equal(result.data.status,'unknown');
  assert.equal(result.data.barcode,gtin);
  assert.match(result.data.note,/create_food/);
  assert.equal(state.changes.length,0);
});

test('a USDA id: found when the catalogue has it, else added through the duplicate check',async()=>{
  const known={usda:{'2345678':40}};
  const found=await addCatalogueFood({},'u1',agent,{kind:'usda',fdcId:2345678},{db:fakeDb(known),card,
    sources:notCalled('sources')});
  assert.deepEqual(found.data,{status:'found',food:{id:40}});

  const state={},icons=[];
  const added=await addCatalogueFood({},'u1',agent,{kind:'usda',fdcId:111},{db:fakeDb(state),card,
    enqueueIcon:async id=>icons.push(id),sources:()=>({usdaSource:async id=>[{sourceId:`usda:${id}`}],
      createFoodFromSource:async sourceId=>{assert.equal(sourceId,'usda:111');return {status:'created',foodId:120}}})});
  assert.deepEqual(added.data,{status:'added',food:{id:120},source:'USDA FoodData Central 111'});
  assert.deepEqual(icons,[120]);
  assert.equal(state.changes[0].action,'created');
  assert.equal(state.changes[0].sourceRef,'111');

  const unsure=await addCatalogueFood({},'u1',agent,{kind:'usda',fdcId:112},{db:fakeDb({}),card,
    sources:()=>({usdaSource:async id=>[{sourceId:`usda:${id}`}],createFoodFromSource:async()=>({status:'possible_duplicates',candidates:[]})})});
  assert.equal(unsure.data.status,'unknown','an unsure duplicate check adds nothing');
  const missing=await addCatalogueFood({},'u1',agent,{kind:'usda',fdcId:113},{db:fakeDb({}),card,
    sources:()=>({usdaSource:async()=>[],createFoodFromSource:notCalled('createFoodFromSource')})});
  assert.equal(missing.data.status,'unknown');
  assert.match(missing.data.note,/no usable record/);
});

test('limits: 5 changes a minute and 50 a day per user',async()=>{
  const add=state=>addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb(state),card,
    barcode:async()=>({status:'found',gtin,foodId:99,created:true,source:{kind:'Online',ref:`off:${gtin}`}})});
  await assert.rejects(add({changes:Array.from({length:5},()=>({}))}),
    error=>error instanceof McpInputError&&/at most 5 a minute and 50 a day/.test(error.message));
  const hourAgo=Date.now()-3_600_000;
  await assert.rejects(add({changes:Array.from({length:50},()=>({at:hourAgo}))}),McpInputError);
  assert.equal((await add({changes:Array.from({length:49},()=>({at:hourAgo}))})).data.status,'added');
});

test('the user\'s "Let agents make changes" setting does not gate catalogue adds',async()=>{
  // The fake database fails any AgentSettings read: the setting is never consulted.
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin},{db:fakeDb({gtins:{[gtin]:15}}),card});
  assert.equal(result.data.status,'found');
});

test('pointers: barcode digits, a USDA id, or a USDA or Open Food Facts page',()=>{
  assert.deepEqual(pointerFrom({barcode:'4809010272010'}),{kind:'barcode',gtin});
  assert.deepEqual(pointerFrom({usdaId:2345678}),{kind:'usda',fdcId:2345678});
  assert.deepEqual(pointerFrom({url:'https://fdc.nal.usda.gov/food-details/2345678/nutrients'}),{kind:'usda',fdcId:2345678});
  assert.deepEqual(pointerFrom({url:'https://fdc.nal.usda.gov/fdc-app.html#/food-details/171705/nutrients'}),{kind:'usda',fdcId:171705});
  assert.deepEqual(pointerFrom({url:'https://world.openfoodfacts.org/product/4809010272010/dried-mangoes'}),{kind:'barcode',gtin});
  assert.deepEqual(pointerFrom({url:'https://fr.openfoodfacts.org/produit/4809010272010'}),{kind:'barcode',gtin});
  assert.throws(()=>pointerFrom({barcode:'4809010272011'}),/isn't valid/,'a wrong check digit');
  assert.throws(()=>pointerFrom({url:'https://world.openfoodfacts.org/product/4809010272011'}),/isn't valid/);
  assert.throws(()=>pointerFrom({url:'https://www.amazon.com/dp/B000000'}),/isn't one Amino can read/);
  assert.throws(()=>pointerFrom({url:'https://fdc.nal.usda.gov.evil.example/food-details/1'}),/isn't one Amino can read/);
  assert.throws(()=>pointerFrom({url:'not a link'}),/isn't a link/);
  assert.throws(()=>pointerFrom({}),/exactly one/);
  assert.throws(()=>pointerFrom({barcode:'4809010272010',usdaId:1}),/exactly one/);
});

test('a change with nothing different is no change; a new energy value is a superseded estimate',()=>{
  assert.equal(changesBetween(food(1),food(1,{lastUpdated:'2026-10-05'})),null);
  assert.equal(changesBetween(food(1),food(1,{kcalPerServing:120})).action,'superseded');
  const nutrients=changesBetween(food(1),food(1,{Nutrient:[...food(1).Nutrient,{nutrientName:'Zinc',nutrientAmountPerDefaultServing:1}]}));
  assert.equal(nutrients.action,'enriched');
  assert.deepEqual(nutrients.changes.nutrientsChanged,['Zinc']);
});

test('foodForBarcode with the web off asks USDA and Open Food Facts only',async()=>{
  const {foodForBarcode}=require('../src/foodSearch/barcodeLookup');
  const db={from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:[],error:null})};return q}};
  const sources={barcodeProduct:notCalled('barcodeProduct (the web)'),async barcodeSources(){return []},
    createFoodFromSource:notCalled('createFoodFromSource')};
  assert.deepEqual(await foodForBarcode('u1',gtin,{db,sources,web:false}),{status:'unknown',gtin});
});

test('search_foods with scope usda lists USDA records to add, creating nothing',async()=>{
  const {usdaResults}=require('../src/mcp/foods');
  const found=await usdaResults('greek yogurt',10,async(query,{limit})=>{
    assert.equal(query,'greek yogurt');assert.equal(limit,10);
    return [{fdcId:171304,name:'Yogurt, Greek, plain, nonfat',brand:null,similarity:0.9,servingGrams:170,kcal:100.3,proteinG:17.34,
      carbG:6.12,totalFatG:0.66,servings:[{unit:'container',grams:170,amount:1}]}];
  });
  assert.deepEqual(found.foods,[{usdaId:171304,name:'Yogurt, Greek, plain, nonfat',brand:null,inAmino:false,
    perServing:{serving:'170 g',kcal:100.3,proteinG:17.3,carbG:6.1,totalFatG:0.7},servings:[{unit:'container',amount:1,grams:170}]}]);
  assert.match(found.note,/add_catalogue_food/);
});

const fairlife='00811620020435';
const unknownInDatabases=async()=>({status:'unknown',gtin:fairlife});
const listings=async()=>({status:'identified',gtin:fairlife,name:'Reduced Fat Ultra-Filtered Milk, Strawberry, 14 fl oz',brand:'fairlife'});
const catalogueHits=async(_user,query)=>{assert.equal(query,'fairlife Reduced Fat Ultra-Filtered Milk, Strawberry, 14 fl oz');
  return {results:[{id:7,source:'custom',match:'name'},{id:4355,source:'catalogue',match:'name'},{id:4356,source:'catalogue',match:'name'},
    {id:9,source:'catalogue',match:'loose'}]}};

test('a barcode no database has goes on the food Amino has when its listings name that product',async()=>{
  const state={foods:{4355:food(4355,{name:'Reduced Fat Chocolate Ultra-Filtered Milk'}),4356:food(4356,{name:'Reduced Fat Strawberry Ultra-Filtered Milk'})}};
  const tried=[];
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin:fairlife},{db:fakeDb(state),card,
    barcode:unknownInDatabases,name:listings,search:catalogueHits,
    attach:()=>({async attachBarcode(foodId,code,description){
      tried.push(foodId);assert.equal(code,fairlife);assert.match(description,/^fairlife /);
      if (foodId!==4356) return {status:'refused',reason:'not_the_same_product'};
      state.foods[4356]={...state.foods[4356],gtin:fairlife};
      return {status:'attached',foodId};
    }})});
  assert.deepEqual(tried,[4355,4356],'shared foods only, closest first; the chocolate one is refused');
  assert.equal(result.data.status,'found');
  assert.deepEqual(result.data.food,{id:4356});
  assert.match(result.data.source,/Barcode listings/);
  assert.equal(state.changes.length,1,'only the food that changed is recorded');
  assert.equal(state.changes[0].foodItemId,4356);
  assert.equal(state.changes[0].sourceKind,'BarcodeName');
  assert.equal(state.changes[0].sourceRef,fairlife);
  assert.deepEqual(state.changes[0].changes.fields.gtin,{before:null,after:fairlife});
});

test('mistyped digits name another product, which no food is: nothing is attached',async()=>{
  const state={foods:{4356:food(4356)}};
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin:fairlife},{db:fakeDb(state),card,
    barcode:unknownInDatabases,name:async()=>({status:'identified',gtin:fairlife,name:'Hammermill Copy Paper',brand:null}),
    search:async()=>({results:[{id:4356,source:'catalogue',match:'meaning'}]}),
    attach:()=>({async attachBarcode(){return {status:'refused',reason:'not_the_same_product'}}})});
  assert.equal(result.data.status,'unknown');
  assert.match(result.data.note,/no food in Amino is the product/);
  assert.equal(state.changes.length,0);
});

test('listings that say the barcode is not food',async()=>{
  const result=await addCatalogueFood({},'u1',agent,{kind:'barcode',gtin:fairlife},{db:fakeDb({}),card,
    barcode:unknownInDatabases,name:async()=>({status:'not_food',gtin:fairlife}),search:notCalled('search')});
  assert.equal(result.data.status,'unknown');
  assert.match(result.data.note,/isn't food/);
});
