require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withMealRun,currentMealRun,recordTool,recordModelCall,recordOpenRouterResponse,recordResolution,mealRunTotals,clip}=
  require('../src/mealResolution/runRecorder');
const {resolveMeal}=require('../src/mealResolution/resolve');
const {missingFromVisibleList}=require('../src/mealResolution/coverageCheck');

test('outside a run every record call is a no-op',()=>{
  assert.equal(currentMealRun(),undefined);
  recordTool('findFood',performance.now(),{query:'rice'},{catalogue:[]});
  recordModelCall({kind:'jev',model:'m',startedAt:performance.now(),status:'ok'});
  recordOpenRouterResponse('first_look','m',performance.now(),{usage:{prompt_tokens:1}},'ok');
  recordResolution({model:'m',timeline:[],trace:[],steps:0,toolCalls:0,durationMs:1});
  assert.equal(currentMealRun(),undefined);
});

test('clip keeps small values, truncates long ones and never throws',()=>{
  assert.deepEqual(clip({a:1,b:['x']}),{a:1,b:['x']});
  assert.equal(clip(undefined),null);
  const long=clip({text:'x'.repeat(5000)},100);
  assert.equal(long.truncated,true);
  assert.equal(long.preview.length,100);
  const circular={};circular.self=circular;
  assert.equal(typeof clip(circular),'string','a circular value becomes a string');
  assert.equal(typeof clip({n:10n}),'string','an unserialisable value becomes a string');
});

test('clip never stores signed photo URLs',()=>{
  const signed='https://x.supabase.co/storage/v1/object/sign/photos/1.jpg?token=eyJabc';
  assert.deepEqual(clip({url:signed,photos:[new URL(signed)],name:'rice'}),{url:'[signed-url]',photos:['[signed-url]'],name:'rice'});
  assert.equal(clip('https://x.supabase.co/storage/v1/object/sign/photos/1.jpg'),'[signed-url]');
  assert.equal(clip({image:`data:image/jpeg;base64,${'A'.repeat(500)}`}).image,'[data-url]');
});

test('a run collects tools, model usage and cost, with totals for the row',async()=>{
  const {value,run}=await withMealRun(async()=>{
    const started=performance.now();
    recordTool('findFood',started,{query:'rice'},{catalogue:[{id:3}]});
    recordTool('addFood',started,{sourceId:'web:0'},null,'boom');
    recordOpenRouterResponse('first_look','flash',started,{usage:{prompt_tokens:100,completion_tokens:20,cost:0.0012},
      choices:[{message:{content:'{"foods":[{"food":"rice"}]}'}}]},'ok');
    recordOpenRouterResponse('second_look','flash',started,null,'http_502');
    // Deep async work sees the same run.
    await new Promise(resolve=>setTimeout(resolve,1));
    recordModelCall({kind:'jev',model:'jev',startedAt:started,promptTokens:10,completionTokens:1,costUsd:0.0001,status:'ok'});
    return 'done';
  });
  assert.equal(value,'done');
  assert.equal(currentMealRun(),undefined,'the run ends with its work');
  assert.deepEqual(run.tools.map(tool=>[tool.name,tool.error??null]),[['findFood',null],['addFood','boom']]);
  assert.deepEqual(run.models[0].output,{foods:[{food:'rice'}]},'the parsed model output is kept');
  assert.equal(run.models[1].promptTokens,0);
  assert.equal(run.models[1].costUsd,null);
  assert.deepEqual(mealRunTotals(run),{modelCalls:3,toolCalls:2,promptTokens:110,completionTokens:21,costUsd:0.0013});
  const empty=await withMealRun(async()=>{recordModelCall({kind:'jev',model:'jev',startedAt:0,status:'unavailable'})});
  assert.equal(mealRunTotals(empty.run).costUsd,null,'no reported cost is unknown, not free');
});

test('a failed raw request is recorded and still fails the same way',async()=>{
  const failing=async()=>{throw Object.assign(new Error('The operation timed out'),{name:'TimeoutError'})};
  const {run}=await withMealRun(async()=>{
    await assert.rejects(missingFromVisibleList([{food:'rice',detail:'',grams:null}],[{name:'Rice'}],
      {fetch:failing,env:{OPENROUTER_API_KEY:'k'}}),/timed out/);
  });
  assert.equal(run.models[0].kind,'coverage_compare');
  assert.equal(run.models[0].status,'timeout');
});

const rice={id:3,name:'White rice, cooked',brand:null,lastUpdated:'2026-09-01T00:00:00Z',defaultServingWeightGram:100,weightUnknown:false,
  kcalPerServing:130,proteinPerServing:2.7,carbPerServing:28,totalFatPerServing:0.3,satFatPerServing:null,transFatPerServing:null,
  fiberPerServing:null,sugarPerServing:null,addedSugarPerServing:null,Serving:[]};
const input={userId:'00000000-0000-4000-8000-000000000001',operationId:'00000000-0000-4000-8000-000000000002',messageId:1,
  originalText:'150 g rice',consumedOn:'2026-09-25T12:00:00Z',submittedAt:'2026-09-25T12:00:00Z',timezone:'UTC',locale:null,attachmentIds:[]};
const evidence=()=>({foods:new Map([[3,rice]]),events:new Map(),discover(){},
  async listMealEvents(){return {events:[]}},async prefetchFoods(){return []},async findFoodsByGtin(){return []},
  async searchFoods(){return {candidates:[{id:3,name:rice.name}],foods:[{id:3,name:rice.name}]}},
  async getFoodsAndServings(){return {foods:[rice]}}});
const good={schemaVersion:1,outcome:'resolved',consumedOn:input.consumedOn,historyGroupSelections:[],claims:[],clarification:null,
  items:[{foodId:3,quantity:{kind:'mass',grams:150},groupId:null,groupLabel:null,evidence:['food:3']}],
  components:[{sourceText:'150 g rice',itemIndexes:[0],historySelectionIndexes:[],omitted:false}]};

test('resolveMeal records each tool call, each agent step with its cost, and the resolution',async()=>{
  const generate=async options=>{
    await options.tools.findFood.execute({query:'rice',gtin:null,includeSources:false,labelSourceId:null},{});
    await options.tools.getFoodsAndServings.execute({foodIds:[3]},{});
    options.onStepFinish({usage:{inputTokens:1200,outputTokens:80},finishReason:'tool-calls',
      toolCalls:[{toolName:'findFood'},{toolName:'getFoodsAndServings'}],providerMetadata:{openrouter:{usage:{cost:0.0021}}}});
    options.onStepFinish({usage:{inputTokens:1500,outputTokens:200},finishReason:'stop',providerMetadata:{},
      toolCalls:[{toolName:'findFood',invalid:true,input:{query:''},error:new Error('Invalid input')}]});
    // An amount written as arithmetic is worked out by the backend (the agent has no calculator tool).
    return {output:{...good,items:[{...good.items[0],quantity:{kind:'mass',grams:'3/2 * 100'}}]},response:{messages:[]}};
  };
  const deps={evidence:evidence(),sources:{sources:new Map()},generate,loadPhotos:async()=>[],fastRoute:false,
    model:()=>({id:'test-model',provider:'test',model:{}})};
  const {value,run}=await withMealRun(()=>resolveMeal(input,deps));
  assert.equal(value.checked,true,'the result is unchanged');
  assert.deepEqual(run.tools[0].input,{query:'rice',gtin:null,includeSources:false,labelSourceId:null});
  assert.ok(Array.isArray(run.tools[1].output.foods));
  assert.equal(value.proposal.items[0].quantity.grams,150,'"3/2 * 100" is evaluated exactly');
  assert.deepEqual(run.models.map(call=>[call.kind,call.promptTokens,call.completionTokens,call.costUsd,call.detail]),
    [['agent_step',1200,80,0.0021,'tool-calls: findFood, getFoodsAndServings'],['agent_step',1500,200,null,'stop: findFood']]);
  assert.deepEqual(run.tools.map(tool=>tool.name),['findFood','getFoodsAndServings','findFood'],'a call the SDK rejected is recorded too');
  assert.match(run.tools[2].error,/^invalid_input: Invalid input/);
  assert.equal(run.resolutions.length,1);
  assert.equal(run.resolutions[0].model,'test-model');
  assert.equal(run.resolutions[0].steps,2);
  assert.ok(run.resolutions[0].trace.some(line=>line.startsWith('findFood:')));

  const failed=await withMealRun(()=>resolveMeal(input,{...deps,generate:async()=>{throw new Error('provider down')}}).catch(error=>error.message));
  assert.equal(failed.value,'provider down');
  assert.equal(failed.run.resolutions[0].error,'provider down','a failed resolution is recorded too');
  // Outside a run the resolver behaves exactly as before.
  assert.equal((await resolveMeal(input,deps)).checked,true);
});
