const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {Client} = require('pg');

const connectionString = process.env.AMINO_MEAL_TEST_DATABASE_URL;
const call = async (client, sql, values) => (await client.query(sql, values)).rows[0].result;
const acceptSql = `select public.accept_meal_operation($1,$2,$3,$4,$5,$6,$7,$8) result`;
const claimSql = `select public.claim_meal_operation($1,$2,$3) result`;
const publishSql = `select public.publish_meal_operation($1,$2,$3) result`;
const finishSql = `select public.finish_meal_operation($1,$2,$3,$4,$5,$6) result`;
const answerSql = `select public.answer_meal_operation($1,$2,$3,$4) result`;
const cancelSql = `select public.cancel_meal_operation($1,$2,$3) result`;

test('meal operations are idempotent, revision fenced, and preserve published foods on edit failure',
  {skip: !connectionString && 'Set AMINO_MEAL_TEST_DATABASE_URL for a disposable test database'}, async () => {
    const a = new Client({connectionString}), b = new Client({connectionString});
    await Promise.all([a.connect(),b.connect()]);
    try {
      const owner = randomUUID(), other = randomUUID(), createId = randomUUID(), clientMealId = randomUUID();
      const foodId = 10000000 + Math.floor(Math.random()*1000000);
      const servingId = foodId;
      const photoId=foodId+1000000,foreignPhotoId=photoId+1;
      await a.query('insert into public."User"(id) values($1),($2)',[owner,other]);
      await a.query('insert into public."UserMessageImages"(id,"userId","imagePath") values($1,$2,$3),($4,$5,$6)',
        [photoId,owner,`${owner}/meal.jpg`,foreignPhotoId,other,`${other}/other.jpg`]);
      await a.query('insert into public."FoodItem"(id,"userId",name,"defaultServingWeightGram","kcalPerServing") values($1,null,$2,100,100)',[foodId,'rice']);
      await a.query('insert into public."Serving"(id,"foodItemId","servingName","servingWeightGram","defaultServingAmount") values($1,$2,$3,100,1)',[servingId,foodId,'cup']);
      const input = {originalText:'one cup rice',consumedOn:'2026-09-24T18:00:00Z',attachmentIds:[photoId]};
      const hash = 'a'.repeat(64);
      await assert.rejects(call(a,acceptSql,[owner,randomUUID(),randomUUID(),null,null,'create',
        {...input,attachmentIds:[foreignPhotoId]},'8'.repeat(64)]),/Meal attachment unavailable/);
      const request = [owner,createId,clientMealId,null,null,'create',input,hash];
      const [first,retry] = await Promise.all([call(a,acceptSql,request),call(b,acceptSql,request)]);
      assert.equal(first.messageId,retry.messageId);
      assert.equal(first.operationId,retry.operationId);
      assert.equal(first.state,'queued');
      assert.equal((await a.query('select "messageId" from public."UserMessageImages" where id=$1',[photoId])).rows[0].messageId,first.messageId);
      await assert.rejects(call(a,acceptSql,[...request.slice(0,7),'b'.repeat(64)]),/Operation key reused/);
      await assert.rejects(call(a,acceptSql,[other,...request.slice(1)]),/Operation key reused/);
      await assert.rejects(call(a,acceptSql,[owner,randomUUID(),clientMealId,null,null,'create',
        {...input,attachmentIds:[]},hash]),/duplicate key/);
      const cancelledCreateId=randomUUID();
      const cancelledCreate=await call(a,acceptSql,[owner,cancelledCreateId,randomUUID(),null,null,'create',
        {...input,attachmentIds:[]},'9'.repeat(64)]);
      assert.equal((await call(a,cancelSql,[owner,cancelledCreateId,cancelledCreate.operationVersion])).state,'cancelled');
      const cancelledMessage=await a.query('select status,"deletedAt" from public."Message" where id=$1',[cancelledCreate.messageId]);
      assert.equal(cancelledMessage.rows[0].status,'FAILED');
      assert.ok(cancelledMessage.rows[0].deletedAt);
      assert.equal(await call(b,claimSql,[cancelledCreateId,randomUUID(),45]),null);
      const token = randomUUID();
      const claimed = await call(a,claimSql,[createId,token,45]);
      assert.equal(claimed.messageId,first.messageId);
      assert.equal(await call(b,claimSql,[createId,randomUUID(),45]),null);
      const plan = {schemaVersion:1,originalText:input.originalText,consumedOn:input.consumedOn,
        input:{attachmentIds:[photoId]},
        items:[{logicalItemId:randomUUID(),foodId,servingId,servingAmount:1,loggedUnit:'cup',grams:100,
          nutrition:{kcal:100,proteinG:2,carbG:20,totalFatG:1,fiberG:4,vitaminCMg:12}}]};
      await assert.rejects(call(b,publishSql,[createId,randomUUID(),plan]),/claim changed/);
      await assert.rejects(call(a,publishSql,[createId,token,{...plan,input:{attachmentIds:[foreignPhotoId]}}]),/Photo evidence changed/);
      await assert.rejects(call(a,publishSql,[createId,token,{...plan,items:[{
        ...plan.items[0],origin:'catalogue',grams:101}]}]),/Serving quantity changed/);
      await assert.rejects(call(a,publishSql,[createId,token,{...plan,items:[{
        ...plan.items[0],catalogueUpdatedAt:'2000-01-01T00:00:00Z'}]}]),/Catalogue evidence changed/);
      const published = await call(a,publishSql,[createId,token,plan]);
      assert.equal(published.publishedRevision,1);
      assert.equal(published.itemsProcessed,1);
      assert.equal((await call(b,acceptSql,request)).state,'succeeded');
      const copied=await a.query('select "fiberG","vitaminCMg" from public."LoggedFoodItem" where "messageId"=$1 and "deletedAt" is null',[first.messageId]);
      assert.deepEqual([copied.rows[0].fiberG,copied.rows[0].vitaminCMg],[4,12]);
      await assert.rejects(a.query('update public."Message" set content=$2 where id=$1',[first.messageId,'legacy overwrite']),/owned by the operation protocol/);
      await assert.rejects(a.query('update public."LoggedFoodItem" set grams=200 where "messageId"=$1',[first.messageId]),/owned by the operation protocol/);
      await assert.rejects(a.query('update public."LoggedFoodItem" set "messageId"=null where "messageId"=$1',[first.messageId]),/owned by the operation protocol/);
      const editId = randomUUID(), editMealId=randomUUID();
      const editInput = {originalText:'two cups rice',consumedOn:input.consumedOn};
      const edit = await call(a,acceptSql,[owner,editId,editMealId,first.messageId,1,'replace',editInput,'c'.repeat(64)]);
      assert.equal(edit.publishedRevision,1);
      await assert.rejects(call(b,acceptSql,[owner,randomUUID(),randomUUID(),first.messageId,1,'replace',editInput,'d'.repeat(64)]),/already active/);
      const editToken=randomUUID();
      await call(a,claimSql,[editId,editToken,45]);
      await call(a,finishSql,[editId,editToken,'failed','SOURCE_UNAVAILABLE',null,null]);
      const before=await a.query('select content,"publishedRevision","activeOperationId" from public."Message" where id=$1',[first.messageId]);
      assert.deepEqual([before.rows[0].content,Number(before.rows[0].publishedRevision),before.rows[0].activeOperationId],
        ['one cup rice',1,null]);
      const foods=await a.query('select id,"foodItemId",grams,"deletedAt" from public."LoggedFoodItem" where "messageId"=$1 and "deletedAt" is null',[first.messageId]);
      assert.equal(foods.rowCount,1);
      assert.equal(foods.rows[0].grams,100);
      const nextId=randomUUID();
      const next=await call(b,acceptSql,[owner,nextId,randomUUID(),first.messageId,1,'replace',editInput,'e'.repeat(64)]);
      assert.equal(next.generation,3);
      assert.equal(next.publishedRevision,1);
      assert.equal((await a.query('select count(*)::integer n from public."MealRevision" where "messageId"=$1',[first.messageId])).rows[0].n,1);
      const nextToken=randomUUID();
      const nextClaim=await call(a,claimSql,[nextId,nextToken,45]);
      await call(a,finishSql,[nextId,nextToken,'needs_clarification','ambiguous_meal',null,{question:'Which rice?'}]);
      await assert.rejects(call(b,answerSql,[other,nextId,nextClaim.operationVersion+1,'brown rice']),/unavailable/);
      const answered=await call(a,answerSql,[owner,nextId,nextClaim.operationVersion+1,'brown rice']);
      assert.equal(answered.state,'queued');
      await assert.rejects(call(b,answerSql,[owner,nextId,nextClaim.operationVersion+1,'white rice']),/version changed/);
      const reclaimed=await call(b,claimSql,[nextId,randomUUID(),45]);
      assert.equal(reclaimed.answers[0].text,'brown rice');
      const cancelled=await call(a,cancelSql,[owner,nextId,reclaimed.operationVersion]);
      assert.equal(cancelled.state,'cancelled');
      await assert.rejects(call(b,publishSql,[nextId,reclaimed.workerToken,plan]),/claim changed/);
      await assert.rejects(call(b,acceptSql,[other,randomUUID(),randomUUID(),first.messageId,1,
        'replace',editInput,'f'.repeat(64)]),/Meal unavailable/);
      const finalId=randomUUID();
      await call(a,acceptSql,[owner,finalId,randomUUID(),first.messageId,1,
        'replace',editInput,'1'.repeat(64)]);
      const finalToken=randomUUID();
      await call(b,claimSql,[finalId,finalToken,45]);
      const replacement={...plan,originalText:editInput.originalText,
        items:[{...plan.items[0],logicalItemId:randomUUID(),grams:200,servingAmount:2,
          nutrition:{kcal:200,proteinG:4,carbG:40,totalFatG:2,fiberG:8,vitaminCMg:24}}]};
      assert.equal((await a.query('select count(*)::integer n from public."LoggedFoodItem" where "messageId"=$1 and "deletedAt" is null',[first.messageId])).rows[0].n,1);
      const final=await call(b,publishSql,[finalId,finalToken,replacement]);
      assert.equal(final.publishedRevision,2);
      const after=await a.query('select m.content,m."publishedRevision",f.grams,f."fiberG" from public."Message" m join public."LoggedFoodItem" f on f."messageId"=m.id and f."deletedAt" is null where m.id=$1',[first.messageId]);
      assert.equal(after.rowCount,1);
      assert.deepEqual([after.rows[0].content,Number(after.rows[0].publishedRevision),after.rows[0].grams,after.rows[0].fiberG],
        ['two cups rice',2,200,8]);
      await assert.rejects(call(a,acceptSql,[owner,randomUUID(),randomUUID(),first.messageId,1,
        'replace',editInput,'2'.repeat(64)]),/revision changed/);
      const source=await a.query('select id,"updatedAt"::text as "updatedAt" from public."LoggedFoodItem" where "messageId"=$1 and "deletedAt" is null',[first.messageId]);
      const copyId=randomUUID();
      const copyInput={originalText:'same meal as yesterday',consumedOn:'2026-09-25T18:00:00Z'};
      await call(a,acceptSql,[owner,copyId,randomUUID(),null,null,'create',copyInput,'3'.repeat(64)]);
      const copyToken=randomUUID();
      await call(b,claimSql,[copyId,copyToken,45]);
      const copiedPlan={...replacement,originalText:copyInput.originalText,consumedOn:copyInput.consumedOn,
        input:{attachmentIds:[]},
        items:[{...replacement.items[0],logicalItemId:randomUUID(),
          sourceItemId:{messageId:first.messageId,loggedFoodItemId:source.rows[0].id,
            updatedAt:source.rows[0].updatedAt,revision:2}}]};
      const copyResult=await call(b,publishSql,[copyId,copyToken,copiedPlan]);
      assert.equal(copyResult.publishedRevision,1);
      assert.equal((await a.query('select "vitaminCMg" from public."LoggedFoodItem" where "messageId"=$1 and "deletedAt" is null',[copyResult.messageId])).rows[0].vitaminCMg,24);
    } finally {await Promise.all([a.end(),b.end()]);}
  });
