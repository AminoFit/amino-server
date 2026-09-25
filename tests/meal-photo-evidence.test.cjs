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
        consumedOn:input.consumedOn,historyGroupSelections:[],items:[],claims:[],
        clarification:'What food is shown?'}};
    }
  });
  assert.deepEqual(result.photoIds,[7]);
  assert.equal(generated.messages[0].content[1].type,'image');
  assert.equal(generated.messages[0].content[1].image.href,signedUrl);
  assert.ok(!generated.messages[0].content[0].text.includes(signedUrl));
  assert.ok(!JSON.stringify(result).includes('token=secret'));
});
