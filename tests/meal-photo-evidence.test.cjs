const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {loadMealPhotos}=require('../src/mealResolution/photos.ts');
const {resolveMeal}=require('../src/mealResolution/resolve.ts');
const {operationRequest}=require('../src/mealOperations/contracts.ts');

const owner='00000000-0000-4000-8000-000000000001';
const signedUrl='https://images.example.test/private/meal.jpg?token=secret';
const fakeDb=rows=>({
  from:()=>{
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      in:()=>query,then:(resolve,reject)=>Promise.resolve({data:rows,error:null}).then(resolve,reject)};
    return query;
  },
  storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl},error:null})})}
});

test('photo-only creation is valid but an empty text-only request is not',()=>{
  const request={schemaVersion:1,operationId:'00000000-0000-4000-8000-000000000002',
    clientMealId:'00000000-0000-4000-8000-000000000003',messageId:null,
    expectedPublishedRevision:null,action:'create',submittedAt:'2026-09-24T18:00:00Z',
    timezone:'America/New_York',locale:'en-US',
    input:{originalText:'',consumedOn:'2026-09-24T18:00:00Z',attachmentIds:[7]}};
  assert.equal(operationRequest.safeParse(request).success,true);
  assert.equal(operationRequest.safeParse({...request,input:{...request.input,attachmentIds:[]}}).success,false);
});

test('only owned and linked photo IDs become short-lived model evidence',async()=>{
  const image={id:7,imagePath:`${owner}/meal.jpg`};
  const photos=await loadMealPhotos(owner,42,[7],false,fakeDb([image]));
  assert.deepEqual(photos.map(photo=>photo.id),[7]);
  assert.equal(photos[0].url.href,signedUrl);
  assert.deepEqual((await loadMealPhotos(owner,42,[],true,fakeDb([image]))).map(photo=>photo.id),[7]);
  await assert.rejects(loadMealPhotos(owner,42,[8],false,fakeDb([])),/media_evidence_unavailable/);
  await assert.rejects(loadMealPhotos(owner,42,[7],false,
    fakeDb([{id:7,imagePath:'another-account/meal.jpg'}])),/media_evidence_unavailable/);
  await assert.rejects(loadMealPhotos(owner,42,[7,7],false,fakeDb([image])),/media_evidence_unavailable/);
});

test('resolver sends photos as image parts and retains only stable IDs',async()=>{
  let generated;
  const input={userId:owner,operationId:'00000000-0000-4000-8000-000000000002',messageId:42,
    originalText:'',consumedOn:'2026-09-24T18:00:00Z',submittedAt:'2026-09-24T18:00:00Z',
    timezone:'America/New_York',locale:'en-US',attachmentIds:[7]};
  const result=await resolveMeal(input,{
    evidence:{foods:new Map(),events:new Map()},
    loadPhotos:async()=>[{id:7,url:new URL(signedUrl)}],
    model:()=>({id:'test',provider:'test',model:{}}),
    generate:async options=>{
      generated=options;
      return {output:{schemaVersion:1,outcome:'needs_clarification',
        consumedOn:input.consumedOn,historyGroupSelections:[],items:[],components:[],claims:[],
        clarification:'What food is shown?'}};
    }
  });
  assert.deepEqual(result.photoIds,[7]);
  assert.equal(generated.messages[0].content[1].type,'image');
  assert.equal(generated.messages[0].content[1].image.href,signedUrl);
  assert.ok(!generated.messages[0].content[0].text.includes(signedUrl));
  assert.ok(!JSON.stringify(result).includes('token=secret'));
});

test('the meal resolver uses the central food model policy by default',async()=>{
  const saved={key:process.env.OPENROUTER_API_KEY,model:process.env.FOOD_REASONING_MODEL}
  process.env.OPENROUTER_API_KEY='test-key';delete process.env.FOOD_REASONING_MODEL
  try {
    await assert.rejects(resolveMeal({userId:owner,operationId:'00000000-0000-4000-8000-000000000009',
      messageId:1,originalText:'100 g rice',consumedOn:'2026-09-24T18:00:00Z',submittedAt:'2026-09-24T18:00:00Z',
      timezone:'America/New_York',locale:'en-US',attachmentIds:[]},
      {evidence:{},loadPhotos:async()=>[],generate:async()=>{throw new Error('model_reached')}}),/model_reached/)
  } finally {
    if(saved.key===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=saved.key
    if(saved.model!==undefined) process.env.FOOD_REASONING_MODEL=saved.model
  }
})

test('with the Sonnet agent the first look and the agent run on Sonnet, with a cached system message and anyOf schema',async()=>{
  const saved=process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY='test-key'
  let generated,looked
  try {
    const input={userId:owner,operationId:'00000000-0000-4000-8000-00000000000a',messageId:42,
      originalText:'',consumedOn:'2026-09-24T18:00:00Z',submittedAt:'2026-09-24T18:00:00Z',
      timezone:'America/New_York',locale:'en-US',attachmentIds:[7]};
    const result=await resolveMeal(input,{agent:'sonnet',
      evidence:{foods:new Map(),events:new Map()},
      loadPhotos:async()=>[{id:7,url:new URL(signedUrl)}],
      visible:async(_urls,_text,options)=>{looked=options;return []},
      generate:async options=>{
        generated=options;
        return {output:{schemaVersion:1,outcome:'needs_clarification',
          consumedOn:input.consumedOn,historyGroupSelections:[],items:[],components:[],claims:[],
          clarification:'What food is shown?'}};
      }
    });
    assert.equal(looked.model,'anthropic/claude-sonnet-5.5');
    assert.equal(result.model,'anthropic/claude-sonnet-5.5');
    assert.equal(result.agent,'sonnet');
    assert.equal(generated.system,undefined);
    const [system,user]=generated.messages;
    assert.equal(system.role,'system');
    assert.match(system.content,/go through originalText mention by mention/);
    assert.match(system.content,/under 150 characters/);
    assert.deepEqual(system.providerOptions.openrouter.cacheControl,{type:'ephemeral'});
    assert.equal(user.content[1].type,'image');
    const schema=JSON.stringify(await generated.output.responseFormat);
    assert.ok(schema.includes('"anyOf"')&&!schema.includes('"oneOf"'));
  } finally {
    if(saved===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=saved
  }
});

test('an injected model runs as Flash without reading the Sonnet flag',async()=>{
  let generated,looked
  const input={userId:owner,operationId:'00000000-0000-4000-8000-00000000000b',messageId:42,
    originalText:'',consumedOn:'2026-09-24T18:00:00Z',submittedAt:'2026-09-24T18:00:00Z',
    timezone:'America/New_York',locale:'en-US',attachmentIds:[7]};
  const result=await resolveMeal(input,{
    evidence:{foods:new Map(),events:new Map()},
    loadPhotos:async()=>[{id:7,url:new URL(signedUrl)}],
    model:()=>({id:'test',provider:'test',model:{}}),
    visible:async(_urls,_text,options)=>{looked=options;return []},
    generate:async options=>{
      generated=options;
      return {output:{schemaVersion:1,outcome:'needs_clarification',
        consumedOn:input.consumedOn,historyGroupSelections:[],items:[],components:[],claims:[],
        clarification:'What food is shown?'}};
    }
  });
  assert.deepEqual(looked,{});
  assert.equal(result.agent,'flash');
  assert.match(generated.system,/You resolve one whole food-log operation/);
  assert.ok(!generated.system.includes('mention by mention'));
  assert.equal(generated.messages[0].role,'user');
  assert.ok(JSON.stringify(await generated.output.responseFormat).includes('"oneOf"'));
});

test('a text meal on Sonnet gets each listed food with its candidates, and a food still being searched with catalogue null',async()=>{
  const saved=process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY='test-key'
  let generated
  try {
    const input={userId:owner,operationId:'00000000-0000-4000-8000-00000000000c',messageId:43,
      originalText:'Coffee / espresso with 1 cup fat free milk',consumedOn:'2026-09-24T18:00:00Z',submittedAt:'2026-09-24T18:00:00Z',
      timezone:'America/New_York',locale:'en-US',attachmentIds:[]};
    const milk={id:822,name:'fat free milk'}
    await resolveMeal(input,{agent:'sonnet',fastRoute:false,
      evidence:{foods:new Map(),events:new Map(),prefetchFoods:async()=>[],listMealEvents:async()=>({events:[]}),
        // The coffee's search never finishes in time; the milk's does.
        searchFoods:query=>/milk/.test(query)?Promise.resolve({foods:[milk]}):new Promise(()=>{})},
      loadPhotos:async()=>[],
      textFoods:async(_text,onFoods)=>{
        const foods=[{food:'Coffee / espresso',detail:'',grams:60,quote:'Coffee / espresso'},
          {food:'fat free milk',detail:'',grams:245,quote:'1 cup fat free milk'}]
        onFoods(foods)
        return new Promise(()=>{})
      },
      generate:async options=>{
        generated=options;
        return {output:{schemaVersion:1,outcome:'needs_clarification',consumedOn:input.consumedOn,
          historyGroupSelections:[],items:[],components:[],claims:[],clarification:'Which coffee?'}};
      }
    });
    const prompt=JSON.parse(generated.messages[1].content)
    assert.deepEqual(prompt.mentionedFoods.map(item=>[item.food,item.catalogue]),
      [['Coffee / espresso',null],['fat free milk',[milk]]]);
    assert.match(generated.messages[0].content,/catalogue null means its search wasn't ready in time/);
  } finally {
    if(saved===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=saved
  }
});
