// Run actual application resolver code with all storage/usage writes replaced by
// in-memory evidence. Unknown runtime dependencies fail closed.
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'../..'),cache=new Map()
function load(file,stubs={},env={},globals={}) {
 let code=cache.get(file)
 if(!code){code=ts.transpileModule(fs.readFileSync(path.join(root,'src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;cache.set(file,code)}
 const module={exports:{}}
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name in stubs)return stubs[name];throw Error('Unstubbed benchmark dependency: '+name)},
 console:{log(){},warn(){},error(){}},process:{env},Date,performance,AbortController,AbortSignal,setTimeout,clearTimeout,...globals})
 return module.exports
}
const models=load('ai/models.ts')
const mass=load('foodMessageProcessing/getServingSizeFromFoodItem/explicitMassServing.ts')
const validate=load('foodResolution/agent/validate.ts',{'@/foodMessageProcessing/getServingSizeFromFoodItem/explicitMassServing':mass,
 '../nutrition':load('foodResolution/nutrition.ts'),'../composition':load('foodResolution/composition.ts')}).validateProposal
const json=load('foodMessageProcessing/common/extractJSON.ts')
const nutrients=load('foodMessageProcessing/common/calculateNutrientData.ts')
function inMemoryDb(foods) {
 return {from(table){if(table!=='FoodItem')throw Error('Forbidden table');let filters=[]
 const q={select(){return q},ilike(k,v){filters.push(f=>String(f[k]).toLowerCase()===v.toLowerCase());return q},eq(k,v){filters.push(f=>f[k]===v);return q},
 async limit(n){return {data:structuredClone(foods.filter(f=>filters.every(fn=>fn(f))).slice(0,n)),error:null}},async single(){return {data:structuredClone(foods.find(f=>filters.every(fn=>fn(f)))??null),error:null}}};return q}}
}
async function standard(c,{request,signal,model}) {
 const env={FOOD_REASONING_MODEL:model,OPENROUTER_API_KEY:'benchmark-transport-supplies-key'}
 const provider=load('languageModelProviders/gemini/foodCompletion.ts',{'@/ai/models':{FOOD_MODEL:models.FOOD_MODEL,foodModel:()=>model,providerPreferences:models.providerPreferences},'../openai/utils/openAiHelper':{LogOpenAiUsage:async()=>{}}},env,
 {fetch:async(url,opts)=>{
   // Keep production payload/defaults intact. Network and key owned by harness.
   if(url!=='https://openrouter.ai/api/v1/chat/completions')throw Error('Unexpected fallback provider')
   const body=await request('chat',JSON.parse(opts.body),signal)
   return {ok:true,status:200,json:async()=>body}
 }})
 const boundary={...provider}
 const matcher=load('foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDb.ts',{'@/foodResolution/model':boundary})
 const admin={createAdminSupabase:()=>inMemoryDb(c.foods)}
 const exact=load('foodMessageProcessing/findExactLocalFood.ts',{'@/utils/supabase/serverAdmin':admin,'@/foodResolution/composition':load('foodResolution/composition.ts')})
 const match=load('foodMessageProcessing/findBestLoggedFoodItemMatchToFood.ts',{
  '@/foodResolution/composition':load('foodResolution/composition.ts'),
  './localDbFoodMatch/matchFoodItemToLocalDb':matcher,'@/utils/supabase/serverAdmin':admin,
  './common/foodProcessingConstants':{COSINE_THRESHOLD:.975,COSINE_THRESHOLD_LOW_QUALITY:.7},
  './findAndAddFoodFromExternalDb':{findAndAddFoodItemInExternalDatabase:async()=>{throw Error('external_required')}},
  // These functions are only used for external records; no external IDs in fixture.
  '@/utils/foodEmbedding':{},'@/FoodDbThirdPty/USDA/getFoodInfo':{},'./common/addFoodItemToDatabase':{},
  './getFullFoodInformationOnline/getFullFoodInformationOnline':{},'./common/debugHelper':{}
 })
 const serving=load('foodMessageProcessing/getServingSizeFromFoodItem/getServingSizeFromFoodItem.ts',{
  './explicitMassServing':mass,'../common/extractJSON':json,'@/foodResolution/model':boundary,mathjs:require('mathjs'),
  '@/utils/supabase/serverAdmin':admin,'../common/debugHelper':{}})
 const item=structuredClone(c.item),user={id:'synthetic-benchmark',tzIdentifier:'UTC'}
 let food=await exact.findExactLocalFood(item),pathway=food?'exact':'semantic'
 if(!food){try{[food]=await match.findBestLoggedFoodItemMatchToFood(c.foods.map(f=>({...f,brand:f.brand??'',cosine_similarity:.85})),item,{},user,0)}
 catch(e){if(e.message==='external_required')return {status:'external_required',pathway};throw e}}
 signal.throwIfAborted()
 const resolved=await serving.findBestServingMatch(item,food,user),grams=resolved.serving.total_serving_g_or_ml
 return {status:'matched',pathway,resolution:{foodId:food.id,servingId:resolved.serving.serving_id??null,grams,...nutrients.calculateNutrientData(grams,food)}}
}
function prepareLoop() {
 const sdk=require('ai'), z=require('zod')
 return load('foodResolution/agent/resolve.ts',{ai:sdk,zod:z,'./model':{},'./evidence':{},'./validate':{validateProposal:validate}}).resolveFoodAgent
}
const resolveLoop=prepareLoop()
async function loop(c,{signal,apiKey,requestFetch,model}) {
 const {createOpenRouter}=require('@openrouter/ai-sdk-provider')
 const provider=createOpenRouter({apiKey,fetch:requestFetch})
 return resolveLoop({user:{id:'synthetic-benchmark',tzIdentifier:'UTC'},messageId:0,referenceTime:'2026-09-23T12:00:00Z',item:c.item,
 candidates:c.foods.map(({id,name,brand})=>({id,name,brand}))},
 {model:()=>({id:model,provider:'openrouter',model:provider.chat(model,{provider:{require_parameters:true},reasoning:{effort:'low'}})}),
 evidence:()=>{const foods=new Map();return {foods,
  searchFoodCandidates:async()=>c.foods.map(({id,name,brand})=>({id,name,brand})),
  getFoodAndServings:async(id)=>{const f=c.foods.find(f=>f.id===id);if(f)foods.set(id,f);return f??null},
  searchUserFoodHistory:async()=>({disposition:c.history.length?'ranked_foods':'none',truncated:false,candidates:c.history.map((f,i)=>({messageId:i+1,occurrenceDays:f.occurrenceDays,foods:[f]}))})}}})
}
module.exports={load,validate,standard,loop,mass,models}
