require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {takeoverMode,shouldTakeOver,takeOverMessage}=require('../src/mealOperations/takeover');

const user={id:'00000000-0000-4000-8000-000000000001',tzIdentifier:'America/New_York'};
const message={id:30321,content:'',hasimages:true,createdAt:'2026-09-25T23:00:21.391',publishedRevision:0};
const db={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>Promise.resolve({data:[{id:8399}],error:null})};return q}};

test('the database flag routes photos first, then everything, and defaults to photos',async()=>{
  const flag=value=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:value===undefined?null:{value},error:null})};return q}});
  assert.equal(await takeoverMode(flag(undefined)),'photos');
  assert.equal(shouldTakeOver({hasimages:true},'photos'),true);
  assert.equal(shouldTakeOver({hasimages:false},'photos'),false);
  assert.equal(shouldTakeOver({hasimages:false},'all'),true);
  assert.equal(shouldTakeOver({hasimages:true},'off'),false);
});

test('a new app message becomes an idempotent takeover create with its photos',async()=>{
  const requests=[],dispatched=[];
  const accept=async(userId,request)=>{requests.push(request);return {operationId:request.operationId,state:'queued'}};
  const reply=await takeOverMessage(user,message,'2026-09-25T23:00:21Z',false,{db,accept,dispatch:async id=>dispatched.push(id)});
  await takeOverMessage(user,message,'2026-09-25T23:00:21Z',false,{db,accept,dispatch:async()=>{}});
  assert.deepEqual(reply,{resultMessage:'Food items submitted and still processing.',status:'PROCESSING',itemsProcessed:0,itemsToProcess:0});
  const [first,retry]=requests;
  assert.equal(first.operationId,retry.operationId,'app retries reuse the same operation');
  assert.equal(first.action,'create');
  assert.equal(first.messageId,30321);
  assert.equal(first.expectedPublishedRevision,null);
  assert.deepEqual(first.input,{originalText:'',consumedOn:'2026-09-25T23:00:21Z',attachmentIds:[8399],takeover:true});
  assert.equal(first.submittedAt,'2026-09-25T23:00:21.391Z');
  assert.deepEqual(dispatched,[first.operationId]);
});

test('an app edit becomes a replace keyed by revision and content, and an active operation is not an error',async()=>{
  const requests=[];
  const accept=async(userId,request)=>{requests.push(request);return {operationId:request.operationId,state:'queued'}};
  const edited={...message,content:'two cups',publishedRevision:1};
  await takeOverMessage(user,edited,'2026-09-25T23:00:21Z',true,{db,accept,dispatch:async()=>{}});
  await takeOverMessage(user,{...edited,content:'three cups'},'2026-09-25T23:00:21Z',true,{db,accept,dispatch:async()=>{}});
  assert.equal(requests[0].action,'replace');
  assert.equal(requests[0].expectedPublishedRevision,1);
  assert.notEqual(requests[0].operationId,requests[1].operationId,'a different edit is a new operation');
  const busy=await takeOverMessage(user,edited,'2026-09-25T23:00:21Z',true,{db,dispatch:async()=>{},
    accept:async()=>{throw new Error('Meal operation already active')}});
  assert.equal(busy.status,'PROCESSING');
  await assert.rejects(takeOverMessage(user,edited,'2026-09-25T23:00:21Z',true,{db,dispatch:async()=>{},
    accept:async()=>{throw new Error('Meal unavailable')}}),/Meal unavailable/);
});

test('a deliberate reprocess uses a new operation while app retries stay idempotent',async()=>{
  const requests=[];
  const accept=async(userId,request)=>{requests.push(request);return {operationId:request.operationId,state:'queued'}};
  const edited={...message,publishedRevision:1};
  await takeOverMessage(user,edited,'2026-09-25T23:00:21Z',true,{db,accept,dispatch:async()=>{}});
  await takeOverMessage(user,edited,'2026-09-25T23:00:21Z',true,{db,accept,dispatch:async()=>{},nonce:'reprocess-1'});
  assert.notEqual(requests[0].operationId,requests[1].operationId);
});
