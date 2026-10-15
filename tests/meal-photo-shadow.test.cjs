require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {photoChoiceTask,startPhotoShadow,shadowRows,finishPhotoShadow,shadowPhoto,SHADOW_MODEL}=require('../src/mealResolution/photoShadow');

const part={type:'image_url',image_url:{url:'data:image/jpeg;base64,AAAA'}};
const candidates=[{id:7,name:'Olive oil',brand:null},{id:8,name:'Extra virgin olive oil',brand:'Kirkland',yourHistory:{timesLogged:4}}];
const oil={food:'olive oil',detail:'drizzled on the salad',catalogue:candidates};
const meal={operationId:'00000000-0000-0000-0000-000000000001',messageId:42,userId:'u1',photoCount:1};
const plan=foodIds=>({proposal:{outcome:'resolved',items:foodIds.map(foodId=>({foodId}))},model:'anthropic/claude-sonnet-5.5',
  agent:'sonnet',durationMs:21000.4,steps:3});

test('the task is a choice over the candidates and none, with the photo and words in the state',()=>{
  const task=photoChoiceTask('salad with oil',oil,[part]);
  assert.deepEqual(Object.keys(task.options),['none','food_7','food_8']);
  assert.match(task.questions.selection.criteria.food_8,/Kirkland.*logged this before/);
  assert.deepEqual(task.state,{photo:part,mealText:'salad with oil',food:'olive oil',seenInPhoto:'drizzled on the salad'});
  assert.deepEqual(photoChoiceTask('',oil,[part,part]).state.photos,[part,part],'several photos go as a list, no empty text');
});

test('Jev runs on 1.14 for each food with candidates, under its own kind, and never rejects',async()=>{
  const calls=[];
  const select=async(task,signal,deps)=>{calls.push({task,deps});return {status:'ok',choice:'food_8',confidence:0.92,durationMs:180.6,costUsd:0.0001}};
  const run=await startPhotoShadow(Promise.resolve([part]),'',[oil,{food:'bread',detail:'',catalogue:[]}],performance.now(),select);
  assert.equal(calls.length,1,'a food without candidates is not asked');
  assert.equal(calls[0].deps.model,SHADOW_MODEL);
  assert.equal(calls[0].deps.kind,'jev_photo_shadow');
  assert.deepEqual(run.answers.map(answer=>[answer.choice,answer.confidence,answer.ms]),[['food_8',0.92,181]]);
  assert.equal(await startPhotoShadow(Promise.resolve([]),'',[oil],0,select),null,'no photo, no shadow');
  assert.equal(await startPhotoShadow(Promise.reject(new Error('x')),'',[oil],0,select),null);
  assert.equal(await startPhotoShadow(Promise.resolve([part]),'',[oil],0,async()=>{throw new Error('down')}),null);
});

test('rows set Jev next to the candidate the plan logged',()=>{
  const run={answers:[{food:oil,status:'ok',choice:'food_8',confidence:0.92,ms:181,costUsd:0.0001}],sentPhotos:1,readyMs:3200};
  const names=id=>({7:{name:'Olive oil',brand:null},8:{name:'Extra virgin olive oil',brand:'Kirkland'},9:{name:'Lettuce',brand:null}})[id];
  const [row]=shadowRows(meal,run,plan([9,8]),names);
  assert.equal(row.agentChoice,'food_8');
  assert.equal(row.jevChoice,'food_8');
  assert.equal(row.mealMs,21000);
  assert.equal(row.jevReadyMs,3200);
  assert.deepEqual(row.candidates[1],{id:8,name:'Extra virgin olive oil',brand:'Kirkland',mine:true});
  assert.deepEqual(row.loggedFoods.map(food=>food.name),['Lettuce','Extra virgin olive oil']);
  assert.equal(shadowRows(meal,run,plan([9]),names)[0].agentChoice,'none');
  assert.equal(shadowRows(meal,run,plan([7,8]),names)[0].agentChoice,'several');
});

test('finishing writes the rows and swallows a failed insert',async()=>{
  const inserted=[];
  const run={answers:[{food:oil,status:'ok',choice:'none',confidence:0.6,ms:200,costUsd:null}],sentPhotos:1,readyMs:900};
  const db=error=>()=>({from:table=>({insert:async rows=>{inserted.push([table,rows.length]);if(error) throw error;return {error:null}}})});
  finishPhotoShadow(Promise.resolve(run),meal,plan([7]),()=>undefined,db());
  finishPhotoShadow(Promise.resolve(run),meal,plan([7]),()=>undefined,db(new Error('offline')));
  finishPhotoShadow(Promise.resolve(null),meal,plan([7]),()=>undefined,db());
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(inserted,[['PhotoJevShadow',1],['PhotoJevShadow',1]]);
});

test('photos are turned upright and fit in 1024 px',async()=>{
  // A 3000x1000 landscape stored sideways (EXIF orientation 6) is 1000x3000 upright.
  const raw=await sharp({create:{width:3000,height:1000,channels:3,background:'#fa0'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const prepared=await shadowPhoto(raw);
  const bytes=Buffer.from(prepared.image_url.url.split(',')[1],'base64');
  const meta=await sharp(bytes).metadata();
  assert.deepEqual([meta.width,meta.height,meta.format,meta.isProgressive,meta.orientation],[341,1024,'jpeg',false,undefined]);
});
