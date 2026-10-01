const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')

// Transpiles a src module with its @/ imports loaded the same way (or stubbed).
function load(file,stubs={}) {
  const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const module={exports:{}}
  const resolve=name=>name in stubs?stubs[name]:name.startsWith('@/')?load(`${name.slice(2)}.ts`,stubs)
    :name.startsWith('.')?load(`${path.join(path.dirname(file),name)}.ts`,stubs):require(name)
  vm.runInNewContext(code,{module,exports:module.exports,require:resolve,console,Number,Object,Math,Error,Set,Map,JSON,Date,Array,String})
  return module.exports
}
// Values made inside the sandbox have its own prototypes: compare plain copies.
const plain=value=>JSON.parse(JSON.stringify(value))
const nutrition=load('userFoods/nutrition.ts')
const {getMappedNutrientField}=load('foodMessageProcessing/common/calculateNutrientData.ts')
const userFoods=load('userFoods/userFoods.ts',{'@/utils/supabase/serverAdmin':{},'@/utils/embeddingsCache/getCachedOrFetchEmbeddings':{}})

const rice={id:1,defaultServingWeightGram:100,kcalPerServing:130,proteinPerServing:2.7,carbPerServing:28,totalFatPerServing:0.3,
  fiberPerServing:0.4,Nutrient:[{nutrientName:'Sodium, Na',nutrientAmountPerDefaultServing:1}]}
const chicken={id:2,defaultServingWeightGram:100,kcalPerServing:165,proteinPerServing:31,carbPerServing:0,totalFatPerServing:3.6,
  Nutrient:[{nutrientName:'Sodium, Na',nutrientAmountPerDefaultServing:74},{nutrientName:'Protein',nutrientAmountPerDefaultServing:99}]}

test('a food contributes what it knows: unknown nutrients stay absent, column macros win over Nutrient rows',()=>{
  const amounts=nutrition.nutrientsAt(chicken,200)
  assert.equal(amounts.kcal,330); assert.equal(amounts.proteinG,62); assert.equal(amounts.sodiumMg,148)
  assert.equal('fiberG' in amounts,false)
  assert.equal(nutrition.nutrientsAt({...chicken,defaultServingWeightGram:null},100),null)
  assert.equal(nutrition.nutrientsAt({...chicken,weightUnknown:true},100),null)
})

test('a recipe is priced per portion from its ingredients; the cooked weight sets the portion weight',()=>{
  const raw=nutrition.recipeValues([{food:rice,grams:600},{food:chicken,grams:400}],4)
  assert.equal(raw.ingredientGrams,1000); assert.equal(raw.portionGrams,250)
  assert.equal(raw.perPortion.kcal,(780+660)/4)
  assert.equal(raw.perPortion.sodiumMg,(6+296)/4)
  assert.ok(Math.abs(raw.perPortion.fiberG-0.6)<1e-9,'known for one ingredient: the sum of what is known')
  const cooked=nutrition.recipeValues([{food:rice,grams:600},{food:chicken,grams:400}],4,1400)
  assert.equal(cooked.portionGrams,350); assert.equal(cooked.perPortion.kcal,raw.perPortion.kcal)
  assert.throws(()=>nutrition.recipeValues([{food:{...rice,kcalPerServing:null},grams:1}],1),/ingredient_nutrition_unavailable/)
})

test('nutrient rows are named so the existing nutrient mapping reads every one back',()=>{
  const amounts=Object.fromEntries(nutrition.ROW_NUTRIENTS.map((key,i)=>[key,i+1]))
  const rows=nutrition.nutrientRows(amounts)
  assert.equal(rows.length,nutrition.ROW_NUTRIENTS.length)
  for (const row of rows) assert.equal(amounts[getMappedNutrientField(row.name)],row.amount,row.name)
  assert.ok(!nutrition.ROW_NUTRIENTS.some(key=>key in nutrition.COLUMN_NUTRIENTS))
  assert.deepEqual(plain(rows.find(row=>row.name==='sodium')),{name:'sodium',unit:'mg',amount:amounts.sodiumMg})
})

test('quantities: servings, grams, and portions of a recipe log the portion serving',()=>{
  const recipe={...chicken,id:9,name:'Chicken pasta',recipePortions:12,defaultServingWeightGram:250,
    Serving:[{id:31,servingName:'portion',servingWeightGram:250,defaultServingAmount:1},
      {id:32,servingName:'whole recipe',servingWeightGram:3000,defaultServingAmount:1}]}
  assert.deepEqual(plain(userFoods.quantityOf(recipe,{portions:1.5})),{grams:375,servingId:31,servingAmount:1.5,loggedUnit:'portion'})
  assert.deepEqual(plain(userFoods.quantityOf(recipe,{servingId:32,amount:0.5})),{grams:1500,servingId:32,servingAmount:0.5,loggedUnit:'whole recipe'})
  assert.deepEqual(plain(userFoods.quantityOf(recipe,{grams:80})),{grams:80,servingId:null,servingAmount:80,loggedUnit:'g'})
  assert.throws(()=>userFoods.quantityOf(recipe,{servingId:99,amount:1}),/serving_unavailable/)
  const item=userFoods.pricedItem(recipe,{portions:2})
  assert.equal(item.nutrition.kcal,330,'2 portions of 165 kcal'); assert.equal(item.foodItemId,9)
  assert.throws(()=>userFoods.pricedItem({...recipe,kcalPerServing:5000},{portions:1}),/invalid_nutrition/,'more than 9.5 kcal/g')
})

test('request bodies: a food needs its serving and macros; a recipe ingredient needs grams or a serving amount',()=>{
  const food={kind:'food',name:'Protein bar',serving:{unit:'bar',amount:1,grams:45},kcal:190,proteinG:20,carbG:22,totalFatG:6,
    nutrients:{sodiumMg:180}}
  assert.equal(userFoods.userFoodBody.safeParse(food).success,true)
  assert.equal(userFoods.userFoodBody.safeParse({...food,nutrients:{kcal:1}}).success,false,'macros are columns, not nutrients')
  assert.equal(userFoods.userFoodBody.safeParse({...food,owner:'x'}).success,false)
  const recipe={kind:'recipe',name:'Chicken pasta',portions:12,ingredients:[{foodItemId:1,grams:500},{foodItemId:2,servingId:4,amount:2}]}
  assert.equal(userFoods.userFoodBody.safeParse(recipe).success,true)
  assert.equal(userFoods.userFoodBody.safeParse({...recipe,ingredients:[{foodItemId:1,servingId:4}]}).success,false)
  assert.equal(userFoods.userFoodBody.safeParse({...recipe,ingredients:[]}).success,false)
  assert.equal(userFoods.quantityInput.safeParse({portions:1.5}).success,true)
  assert.equal(userFoods.quantityInput.safeParse({portions:1.5,grams:3}).success,false)
})
