const {test}=require('node:test'),assert=require('node:assert/strict')
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {preserveExplicitAdditions,missingExplicitAdditions}=require('../src/foodResolution/composition.ts')
const {validateProposal}=require('../src/foodResolution/agent/validate.ts')
const item=(text,name='Whole Chicken Breast',extra={})=>({food_database_search_name:name,full_item_user_message_including_serving:text,branded:false,...extra})
test('reported image extraction keeps chicken and oil/vinegar dressing as two distinct foods',()=>{
 const source=item('Whole chicken breast with olive oil and vinegar dressing'),rows=preserveExplicitAdditions([source])
 assert.equal(rows.length,2);assert.equal(rows[0].full_item_user_message_including_serving,'Whole chicken breast')
 assert.equal(rows[1].food_database_search_name,'olive oil and vinegar dressing')
 assert.equal(rows[1].componentOrigin.portionSpecified,false);assert.equal(rows[1].serving,undefined);assert.equal(rows[1].nutritional_information,undefined)
 assert.equal(source.full_item_user_message_including_serving,'Whole chicken breast with olive oil and vinegar dressing')
})
test('explicit base and addition amounts remain separate, including woth typo',()=>{
 const rows=preserveExplicitAdditions([item('200 g chicken breast woth 2 tbsp olive oil')])
 assert.equal(rows.length,2);assert.equal(rows[0].full_item_user_message_including_serving,'200 g chicken breast')
 assert.equal(rows[1].food_database_search_name,'olive oil');assert.equal(rows[1].full_item_user_message_including_serving,'2 tbsp olive oil')
 assert.equal(rows[1].componentOrigin.portionSpecified,true)
})
test('an already extracted matching dressing is not counted a second time',()=>{
 const dressing=item('Olive oil and vinegar dressing on the side, approximately 30ml','Olive Oil and Vinegar Dressing')
 const rows=preserveExplicitAdditions([item('Whole chicken breast with olive oil and vinegar dressing'),dressing])
 assert.equal(rows.length,2);assert.equal(rows[0].full_item_user_message_including_serving,'Whole chicken breast');assert.equal(rows[1],dressing)
})
test('nutrition totals, ambiguous component weights and packaged foods are not mechanically split',()=>{
 for(const source of [item('700 cal chicken with olive oil'),
  item('chicken with olive oil, approximately 200g'),item('chicken with olive oil','Chicken',{nutritional_information:{kcal:700}}),
  item('one protein bar with almonds','Protein bar',{branded:true,brand:'Brand'}),item('cream of chicken soup with cream','Cream of Chicken Soup')]){
  assert.deepEqual(preserveExplicitAdditions([source]),[source])
 }
})
test('negations, intrinsic peanut butter and salt do not add hidden food rows',()=>{
 for(const source of [item('chicken without oil'),item('chicken with no dressing'),item('chicken with salt'),item('one tbsp peanut butter','Peanut Butter')])
  assert.deepEqual(preserveExplicitAdditions([source]),[source])
})
test('ambiguous overlapping side entries are not silently merged or duplicated',()=>{
 const source=item('chicken with olive oil'),side=item('sesame oil','Sesame oil')
 assert.equal(preserveExplicitAdditions([source,side]).length,2)
 assert.equal(preserveExplicitAdditions([source,side])[0],source)
})
test('plain foods cannot cover explicit energy-bearing additions',()=>{
 for(const addition of ['olive oil and vinegar dressing','butter','cheese','mayonnaise','pesto sauce','honey','avocado','bacon']){
  assert.ok(missingExplicitAdditions(item('chicken with '+addition),'chicken breast').length>0)
  assert.equal(missingExplicitAdditions(item('chicken with '+addition),'chicken with '+addition).length,0)
 }
 assert.ok(missingExplicitAdditions(item('chicken woth oil dressing'),'chicken breast').length>0)
})
test('a dressing itself remains one composite food and can match vinaigrette',()=>{
 assert.equal(missingExplicitAdditions(item('olive oil and vinegar dressing','Olive oil and vinegar dressing'),'Salad Dressing, Home Recipe, Vinegar And Oil').length,0)
 assert.equal(missingExplicitAdditions(item('chicken with oil dressing'),'chicken with vinaigrette').length,0)
 assert.ok(missingExplicitAdditions(item('chicken with oil dressing'),'chicken with fat-free vinaigrette').length>0)
})
test('agent proposals with valid numbers still fail when the food omits oil dressing',()=>{
 const food={id:1,name:'Chicken breast',brand:null,defaultServingWeightGram:100,weightUnknown:false,kcalPerServing:165,proteinPerServing:31,carbPerServing:0,totalFatPerServing:3.6,Serving:[]}
 const result=validateProposal({decision:'match',foodId:1,servingId:null},item('200 g chicken breast with olive oil dressing','Chicken breast'),new Map([[1,food]]))
 assert.equal(result,null)
})
test('coffee with a branded milk is split and the milk keeps its postfix cup quantity',()=>{
 const source=item('coffee with Fairlife milk cup','coffee with Fairlife milk',{branded:true,brand:'Fairlife',serving:{total_serving_g_or_ml:240}})
 const rows=preserveExplicitAdditions([source])
 assert.equal(rows.length,2)
 assert.equal(rows[0].food_database_search_name,'coffee');assert.equal(rows[0].branded,false);assert.equal(rows[0].brand,'')
 assert.equal(rows[0].full_item_user_message_including_serving,'coffee');assert.equal(rows[0].serving,undefined)
 assert.equal(rows[1].food_database_search_name,'Fairlife milk');assert.equal(rows[1].brand,'Fairlife');assert.equal(rows[1].branded,true)
 assert.equal(rows[1].full_item_user_message_including_serving,'Fairlife milk cup');assert.equal(rows[1].componentOrigin.portionSpecified,true)
 assert.equal(rows[1].serving,undefined);assert.equal(rows[1].nutritional_information,undefined)
 assert.doesNotMatch(rows[1].food_database_search_name,/2%|whole|fat.free/i)
 assert.equal(source.brand,'Fairlife');assert.equal(source.serving.total_serving_g_or_ml,240)
})
test('the same brand-locality rule applies to other independent database foods',()=>{
 for(const [base,addition,brand] of [['tea','2 tbsp Oatly oat milk','Oatly'],['espresso','one cup Fairlife milk','Fairlife'],['toast','10 g Kerrygold butter','Kerrygold'],['oatmeal','1 tbsp Skippy peanut butter','Skippy']]){
  const rows=preserveExplicitAdditions([item(base+' with '+addition,base+' with '+addition,{brand,branded:true})])
  assert.equal(rows.length,2);assert.equal(rows[0].brand,'');assert.equal(rows[1].brand,brand)
  assert.equal(rows[1].full_item_user_message_including_serving,addition)
 }
})
test('a shortened extraction query cannot lose the base food when the brand belongs to its addition',()=>{
 for(const query of ['coffee','Fairlife milk']){
  const rows=preserveExplicitAdditions([item('coffee with Fairlife milk cup',query,{branded:true,brand:'Fairlife'})])
  assert.equal(rows.length,2);assert.equal(rows[0].food_database_search_name,'coffee');assert.equal(rows[1].food_database_search_name,'Fairlife milk')
 }
})
test('branded milk already extracted separately is reused even when brand is a separate field',()=>{
 const milk=item('1 cup Fairlife milk','milk',{brand:'Fairlife',branded:true})
 const rows=preserveExplicitAdditions([item('coffee with Fairlife milk cup','coffee with Fairlife milk',{brand:'Fairlife',branded:true}),milk])
 assert.equal(rows.length,2);assert.equal(rows[0].food_database_search_name,'coffee');assert.equal(rows[1],milk)
})
test('brand ambiguity and packaged or named complete drinks do not trigger mechanical decomposition',()=>{
 for(const source of [
  item('Starbucks coffee with milk','Coffee with milk',{brand:'Starbucks',branded:true}),
  item('coffee with milk','Coffee with milk',{brand:'Fairlife',branded:true}),
  item('coffee with Fairlife milk','Coffee with Fairlife milk',{brand:'Fairlife',branded:true,upc:123}),
  item('bottled coffee with Fairlife milk','Bottled coffee with Fairlife milk',{brand:'Fairlife',branded:true}),
  item('coffee protein shake with Fairlife milk','Coffee protein shake with Fairlife milk',{brand:'Fairlife',branded:true}),
  item('Starbucks latte with milk','Latte',{brand:'Starbucks',branded:true})
 ])assert.deepEqual(preserveExplicitAdditions([source]),[source])
})
test('coffee size and milk quantity stay attached to their own components',()=>{
 const rows=preserveExplicitAdditions([item('one cup coffee with 2 tbsp Fairlife 2% milk','coffee with Fairlife milk',{brand:'Fairlife',branded:true})])
 assert.equal(rows.length,2);assert.equal(rows[0].full_item_user_message_including_serving,'one cup coffee')
 assert.equal(rows[1].full_item_user_message_including_serving,'2 tbsp Fairlife 2% milk')
 assert.equal(rows[1].food_database_search_name,'Fairlife 2% milk')
})
