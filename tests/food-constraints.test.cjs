const {test}=require('node:test'),assert=require('node:assert/strict')
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {validateNutritionPlan,hasNutritionStatement}=require('../src/foodResolution/constraints/contract.ts')
const {derivePortion,checkProductIdentity,reconcileMealTotal}=require('../src/foodResolution/constraints/evaluate.ts')
const {extractNutritionPlan}=require('../src/foodResolution/constraints/extract.ts')
const {foodConfig}=require('../src/foodResolution/config.ts'),{MockLanguageModelV3}=require('ai/test')
const claim=(sourceText,extra={})=>({id:'c1',sourceText,nutrient:'kcal',value:250,purpose:'portion',relation:'eq',basis:'consumed',servingUnit:null,itemIndexes:[0],...extra})
const kefir={id:1,name:'Plain kefir',brand:null,defaultServingWeightGram:100,weightUnknown:false,kcalPerServing:60,proteinPerServing:3.5,carbPerServing:4.5,totalFatPerServing:null,Serving:[]}
const bar={...kefir,id:2,name:'Chocolate protein bar',defaultServingWeightGram:60,kcalPerServing:240,proteinPerServing:25,carbPerServing:15,totalFatPerServing:8,
 Serving:[{id:3,foodItemId:2,servingName:'bar',servingWeightGram:60,defaultServingAmount:1}]}
const identity=claim('chocolate protein bar with 25g of protein',{nutrient:'proteinG',value:25,purpose:'identity',basis:'per_serving',servingUnit:'bar'})
test('three user examples retain different purposes and scopes',()=>{
 for(const c of [identity,claim('250cals of kefire'),claim('700 cal Sweetgreen salad',{value:700,purpose:'meal_total',itemIndexes:[0,1,2]})])
  assert.ok(validateNutritionPlan({claims:[c]},c.sourceText,3))
 assert.equal(hasNutritionStatement('100 g protein powder'),false);assert.equal(hasNutritionStatement('100 g fat-free yogurt'),false)
})
test('source validation rejects invented numbers, missing facts, wrong scopes and unknown item indices',()=>{
 const good=claim('250 cals of kefir')
 for(const bad of [{...good,value:200},{...good,sourceText:'250 cals of milk'},{...good,itemIndexes:[9]},{...good,itemIndexes:[0,0]},
  {...good,relation:'approx'},{...good,basis:'per_serving'},{...good,purpose:'identity'}])assert.equal(validateNutritionPlan({claims:[bad]},good.sourceText,1),null)
 assert.equal(validateNutritionPlan({claims:[good]},good.sourceText+' plus 100 cal juice',2),null)
 assert.equal(validateNutritionPlan({claims:[]},good.sourceText,1),null)
 assert.equal(validateNutritionPlan({claims:[good,good]},good.sourceText,1),null)
})
test('qualifiers and per-100-g labels are checked against the actual source quote',()=>{
 for(const [prefix,relation] of [['about','approx'],['at least','min'],['at most','max']]){
  const c=claim(prefix+' 250 cal kefir',{relation});assert.ok(validateNutritionPlan({claims:[c]},c.sourceText,1))
  assert.equal(validateNutritionPlan({claims:[{...c,relation:'eq'}]},c.sourceText,1),null)
 }
 const c=claim('protein powder with 25g protein per 100g',{nutrient:'proteinG',value:25,purpose:'identity',basis:'per_100g'})
 assert.ok(validateNutritionPlan({claims:[c]},c.sourceText,1));assert.equal(validateNutritionPlan({claims:[{...c,basis:'per_serving',servingUnit:'serving'}]},c.sourceText,1),null)
 assert.equal(validateNutritionPlan({claims:[claim('250-300 cal kefir',{value:300})]},'250-300 cal kefir',1),null)
})
test('calorie targets derive portions from source nutrition and keep unknown macros null',()=>{
 const out=derivePortion(kefir,claim('250cals of kefire'))
 assert.equal(out.status,'resolved');assert.ok(Math.abs(out.grams-416.6666666667)<1e-7);assert.ok(Math.abs(out.nutrition.kcal-250)<1e-8)
 assert.equal(out.nutrition.totalFatG,null);assert.equal(out.provenance.source,'calculated_from_user_target')
 assert.equal(derivePortion(kefir,claim('250cals of kefire'),100).status,'conflict')
})
test('cropping a source quote cannot remove a qualifier, sign or per-100-g basis',()=>{
 const c=claim('250 cal kefir')
 for(const prefix of ['about ','at least ','-','1,'])assert.equal(validateNutritionPlan({claims:[c]},prefix+c.sourceText,1),null)
 const protein={...identity,sourceText:'bar with 25g protein'}
 assert.equal(validateNutritionPlan({claims:[protein]},protein.sourceText+' per 100g',1),null)
 assert.ok(validateNutritionPlan({claims:[{...c,relation:'approx'}]},'about '+c.sourceText,1))
})
test('zero or missing bases, impossible portions and lower-bound targets do not become invented servings',()=>{
 for(const f of [{...kefir,kcalPerServing:0},{...kefir,kcalPerServing:null},{...kefir,defaultServingWeightGram:0}])assert.equal(derivePortion(f,claim('250 cal kefir')).status,'missing_basis')
 assert.equal(derivePortion(kefir,claim('10000 cal kefir',{value:10000})).status,'invalid_nutrition')
 assert.equal(derivePortion(kefir,claim('at least 250 cal kefir',{relation:'min'})).status,'unsupported')
})
test('25 g protein per bar identifies the bar; a 20 g bar cannot be scaled to pass',()=>{
 assert.equal(checkProductIdentity(bar,identity,3).status,'matches')
 const wrong=checkProductIdentity({...bar,proteinPerServing:20},identity,3)
 assert.equal(wrong.status,'conflict');assert.equal(wrong.grams,60)
 assert.equal(derivePortion(bar,identity).status,'unsupported')
 assert.equal(checkProductIdentity({...bar,proteinPerServing:null},identity,3).status,'missing_basis')
 assert.equal(checkProductIdentity(bar,identity,99).status,'missing_basis')
})
test('per-100-g and per-unit serving bases do not get confused with consumed amounts',()=>{
 const per100={...identity,basis:'per_100g',servingUnit:null,value:25,sourceText:'25g protein per 100g'}
 assert.equal(checkProductIdentity(bar,per100,3).status,'conflict')
 const twoBars={...bar,Serving:[{...bar.Serving[0],servingWeightGram:120,defaultServingAmount:2,servingName:'2 bars'}]}
 assert.equal(checkProductIdentity(twoBars,identity,3).status,'matches')
})
test('meal reconciliation counts only its members and rejects parent/child double counting',()=>{
 const total=claim('700 cal salad',{value:700,purpose:'meal_total',itemIndexes:[0,1]})
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:300},{itemIndex:1,kcal:400},{itemIndex:2,kcal:100}]).totalKcal,700)
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:300},{itemIndex:1,kcal:300}]).status,'conflict')
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:700},{itemIndex:1,kcal:300,parentItemIndex:0}]).status,'invalid_group')
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:700}]).status,'unresolved')
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:300},{itemIndex:1,kcal:null}]).status,'unresolved')
})
test('only source rounding residuals can be reconciled, never invented oil or scaled ingredients',()=>{
 const total=claim('700 cal salad',{value:700,purpose:'meal_total',itemIndexes:[0,1]})
 const out=reconcileMealTotal(total,[{itemIndex:0,kcal:233.335},{itemIndex:1,kcal:466.665}])
 assert.equal(out.status,'matches');assert.ok(Math.abs(out.components.reduce((sum,c)=>sum+c.kcal,0)-700)<1e-8)
 assert.ok(Math.abs(out.roundingAdjustmentKcal)<=.01)
 assert.equal(reconcileMealTotal(total,[{itemIndex:0,kcal:233.33},{itemIndex:1,kcal:466}]).status,'conflict')
})
test('separate meal-total groups cannot overlap and count a food twice',()=>{
 const a=claim('700 cal salad',{value:700,purpose:'meal_total'}),b=claim('100 cal drink',{id:'c2',value:100,purpose:'meal_total'})
 assert.equal(validateNutritionPlan({claims:[a,b]},a.sourceText+' plus '+b.sourceText,2),null)
 assert.ok(validateNutritionPlan({claims:[a,{...b,itemIndexes:[1]}]},a.sourceText+' plus '+b.sourceText,2))
})
test('actual SDK JSON extraction validates the response and makes no provider retry',async()=>{
 const c=claim('250 cals of kefir'),model=new MockLanguageModelV3({doGenerate:async()=>({content:[{type:'text',text:JSON.stringify({claims:[c]})}],finishReason:{unified:'stop',raw:'stop'},warnings:[],usage:{inputTokens:{total:10},outputTokens:{total:20}}})})
 const result=await extractNutritionPlan(c.sourceText,[{food_database_search_name:'kefir',full_item_user_message_including_serving:c.sourceText}],{model:()=>({id:'synthetic',provider:'mock',model})})
 assert.equal(result.status,'valid');assert.equal(result.plan.claims[0].purpose,'portion');assert.equal(model.doGenerateCalls.length,1)
})
test('nutrition shadow is independently gated and cannot be enabled as live',()=>{
 assert.equal(foodConfig('u',{}).features.nutrition_constraints,'off')
 for(const mode of ['shadow','on'])assert.equal(foodConfig('u',{FOOD_NUTRITION_CONSTRAINTS:mode,FOOD_NUTRITION_CONSTRAINTS_PERCENT:'100'}).features.nutrition_constraints,mode==='shadow'?'shadow':'off')
})
