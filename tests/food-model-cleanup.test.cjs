const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')

function load(file,stubs={},globals={}){
  const source=fs.readFileSync(path.join(__dirname,'..','src',file),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const module={exports:{}}
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
    if(name in stubs)return stubs[name]
    throw Error(`Unstubbed dependency: ${name}`)
  },process:{env:{}},AbortSignal,URL,console,...globals})
  return module.exports
}

const taxonomy=load('foodMessageProcessing/classifyFoodItemInCategory/foodItemCategories.ts')
const categories=load('foodMessageProcessing/classifyFoodItemInCategory/classifyFoodItemInCategory.ts',{
  '@/ai/models':{decisionModel:()=> 'typesafe/jev-1.13'},
  '@/foodResolution/agent/jev':{},'./foodItemCategories':taxonomy
})

test('category taxonomy has unique IDs and keeps Celery and Tomatoes distinct',()=>{
  assert.equal(categories.foodCategories.length,403)
  assert.equal(categories.foodCategories.find(c=>c.name==='Celery').id,'F-8-3')
  assert.equal(categories.foodCategories.find(c=>c.name==='Tomatoes').id,'F-8-11')
  assert.equal(new Set(categories.foodCategories.map(c=>c.id)).size,403)
  assert.ok(categories.foodCategories.every(c=>c.name.length>0))
  assert.equal(categories.foodCategories.some(c=>c.id==='G-3-7'),false)
})

test('two-stage Jev decisions cover every category within the API choice limit',()=>{
  const families=categories.familyDecisionTask('synthetic food',null)
  const familyIds=Object.keys(families.options).filter(id=>id!=='none')
  assert.equal(familyIds.length,14)
  assert.ok(Object.keys(families.options).length<=255)
  const covered=[]
  for(const familyId of familyIds){
    const leaf=categories.categoryDecisionTask('synthetic food',null,familyId)
    const ids=Object.keys(leaf.options).filter(id=>id!=='none')
    assert.ok(Object.keys(leaf.options).length<=255,`${familyId} exceeds Jev's choice limit`)
    assert.ok(ids.every(id=>id.startsWith(`${familyId}-`)))
    covered.push(...ids)
  }
  assert.deepEqual(covered.sort(),[...categories.foodCategories].map(category=>category.id).sort())
})

test('Jev category decision accepts a supported confident choice and abstains otherwise',async()=>{
  const food={id:4,name:'Tomatoes',brand:null}
  const tasks=[]
  const select=async candidate=>{tasks.push(candidate);return {status:'ok',choice:tasks.length===1?'F':'F-8-11',confidence:.95}}
  const result=await categories.classifyFoodItemToCategory(food,null,{select})
  assert.equal(result.foodItemCategoryID,'F-8-11')
  assert.equal(tasks.length,2)
  assert.equal(Object.keys(tasks[0].options).length,15)
  assert.ok(Object.keys(tasks[1].options).length<255)
  assert.equal(await categories.classifyFoodItemToCategory(food,null,{select:async()=>({status:'ok',choice:'F',confidence:.7})}),null)
  assert.equal(await categories.classifyFoodItemToCategory(food,null,{select:async()=>({status:'ok',choice:'F',confidence:.85})}),null)
  assert.equal(await categories.classifyFoodItemToCategory(food,null,{select:async()=>({status:'ok',choice:'none',confidence:.99})}),null)
  assert.equal(await categories.classifyFoodItemToCategory(food,null,{select:async()=>({status:'ok',choice:'unknown',confidence:.99})}),null)
  let calls=0
  assert.equal(await categories.classifyFoodItemToCategory(food,null,{select:async()=>({status:'ok',choice:++calls===1?'F':'E-5-2',confidence:.99})}),null)
})

test('category worker updates an uncategorized food once and skips categorized foods',async()=>{
  let handler
  let assigned=null,classified=0
  const food={id:4,name:'Tomatoes',brand:null,foodItemCategoryID:null}
  load('app/api/queues/classify-food-category/classify-food-category.ts',{
    'quirrel/next-app':{Queue:(_path,work)=>{handler=work;return {}}},
    '@/utils/supabase/serverAdmin':{createAdminSupabase:()=>({from:()=>({
      select:()=>({eq:()=>({single:async()=>({data:food,error:null})})}),
      update:value=>({eq:()=>({is:async()=>{assigned=value;food.foodItemCategoryID=value.foodItemCategoryID;return {error:null}}})})
    })})},
    '@/foodMessageProcessing/classifyFoodItemInCategory/classifyFoodItemInCategory':{classifyFoodItemToCategory:async()=>{
      classified++;return {foodItemCategoryID:'F-8-11',foodItemCategoryName:'Tomatoes'}
    }}
  })
  await handler('4')
  assert.equal(classified,1)
  assert.equal(assigned.foodItemCategoryID,'F-8-11')
  await handler('4')
  assert.equal(classified,1)
  await assert.rejects(handler('not-an-id'),/Invalid food ID/)
})

const web=load('foodResolution/webFood.ts',{
  '@/ai/models':{},'@/languageModelProviders/openai/utils/openAiHelper':{}
})
test('Exa food response requires finished JSON and reads only cited URLs',()=>{
  const result=web.parseWebFoodResponse({choices:[{finish_reason:'stop',message:{
    content:'```json\n{"source_url":"https://example.test/food"}\n```',
    annotations:[{type:'url_citation',url_citation:{url:'https://example.test/food'}},{type:'other',url_citation:{url:'https://example.test/fake'}}]
  }}]})
  assert.equal(result.sourceUrls.length,1)
  assert.equal(web.citedSource(result.data.source_url,result.sourceUrls),'https://example.test/food')
  assert.equal(web.citedSource('https://example.test/fake',result.sourceUrls),null)
  assert.throws(()=>web.parseWebFoodResponse({choices:[{finish_reason:'length',message:{content:'{}'}}]}),/finish/)
})
