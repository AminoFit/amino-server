const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {assertDisposable,buildMealSchema}=require('./helpers/mealTestDb.cjs');

// Server-side takeover of messages created by the current app, on a real database.
const connectionString=process.env.AMINO_TAKEOVER_TEST_DATABASE_URL;
const call=async(client,sql,values)=>(await client.query(sql,values)).rows[0].result;
const acceptSql='select public.accept_meal_operation($1,$2,$3,$4,$5,$6,$7,$8) result';
const claimSql='select public.claim_meal_operation($1,$2,$3) result';
const publishSql='select public.publish_meal_operation($1,$2,$3) result';
const finishSql='select public.finish_meal_operation($1,$2,$3,$4,$5,$6) result';

test('the operation pipeline can take over app messages without locking the app out afterwards',
  {skip:!connectionString&&'Set AMINO_TAKEOVER_TEST_DATABASE_URL for a disposable local database'},async()=>{
    assertDisposable(connectionString);
    const db=new Client({connectionString});
    await db.connect();
    try {
      await buildMealSchema(db);
      const owner=randomUUID(),other=randomUUID(),consumedOn='2026-09-25T23:00:00Z';
      await db.query('insert into public."User"(id) values($1),($2)',[owner,other]);
      await db.query('insert into public."FoodItem"(id,name,"defaultServingWeightGram","kcalPerServing") values(7001,$1,37,150)',['Cheerios Protein']);
      await db.query('insert into public."Serving"(id,"foodItemId","servingName","servingWeightGram","defaultServingAmount") values(7001,7001,$1,37,1)',['cup']);
      // The current app inserts the message and links its photo, then asks for processing.
      const appMessage=async(id,userId=owner,status='RECEIVED')=>{
        await db.query(`insert into public."Message"(id,"userId",content,status,"consumedOn","itemsProcessed","itemsToProcess",hasimages)
          values($1,$2,'',$3,$4,0,0,true)`,[id,userId,status,consumedOn]);
        await db.query('insert into public."UserMessageImages"(id,"userId","messageId","imagePath") values($1,$2,$1,$3)',[id,userId,`${userId}/${id}.jpg`]);
      };
      await appMessage(900);
      const input={originalText:'',consumedOn,attachmentIds:[900],takeover:true,submittedAt:consumedOn,timezone:'UTC',locale:null};
      const opId=randomUUID(),mealId=randomUUID(),hash='t'.repeat(64);
      const request=[owner,opId,mealId,900,null,'create',input,hash];

      const accepted=await call(db,acceptSql,request);
      assert.equal(accepted.state,'queued');
      assert.equal(accepted.messageId,900);
      const queued=(await db.query('select status,"activeOperationId","operationOwned" from public."Message" where id=900')).rows[0];
      assert.deepEqual([queued.status,queued.activeOperationId,queued.operationOwned],['PROCESSING',opId,false]);
      assert.equal((await call(db,acceptSql,request)).operationId,opId,'an app retry returns the same operation');

      // Only server code may take over, only unprocessed messages, only the owner's.
      await assert.rejects(call(db,acceptSql,[owner,randomUUID(),randomUUID(),900,null,'create',{...input,takeover:false},'u'.repeat(64)]),/Invalid creation input/);
      await appMessage(901,other);
      await assert.rejects(call(db,acceptSql,[owner,randomUUID(),randomUUID(),901,null,'create',{...input,attachmentIds:[]},'v'.repeat(64)]),/Meal unavailable/);
      await appMessage(902,owner,'RESOLVED');
      await assert.rejects(call(db,acceptSql,[owner,randomUUID(),randomUUID(),902,null,'create',{...input,attachmentIds:[]},'w'.repeat(64)]),/Not an unprocessed food log/);

      // While the agent works, the legacy pipeline cannot write to the meal.
      await assert.rejects(db.query('update public."Message" set status=$2 where id=$1',[900,'FAILED']),/owned by the operation protocol/);
      await assert.rejects(db.query('insert into public."LoggedFoodItem"("userId","messageId",grams) values($1,900,10)',[owner]),/owned by the operation protocol/);

      const token=randomUUID();
      assert.equal((await call(db,claimSql,[opId,token,45])).messageId,900);
      const plan={schemaVersion:1,originalText:'',consumedOn,input:{attachmentIds:[900]},
        items:[{logicalItemId:randomUUID(),foodId:7001,servingId:7001,servingAmount:1,loggedUnit:'cup',grams:37,
          nutrition:{kcal:150,proteinG:8,carbG:24,totalFatG:2.5}}]};
      assert.equal((await call(db,publishSql,[opId,token,plan])).publishedRevision,1);
      const published=(await db.query('select status,"itemsProcessed","itemsToProcess","activeOperationId","operationOwned" from public."Message" where id=900')).rows[0];
      assert.deepEqual(published,{status:'RESOLVED',itemsProcessed:1,itemsToProcess:1,activeOperationId:null,operationOwned:false});

      // Afterwards the current app edits, moves and deletes as it always has.
      await db.query('update public."LoggedFoodItem" set grams=74 where "messageId"=900');
      await db.query('update public."Message" set content=$2 where id=$1',[900,'two cups']);

      // An app edit is taken over as a replace and still leaves the meal editable.
      const editId=randomUUID();
      const edit=await call(db,acceptSql,[owner,editId,mealId,900,1,'replace',{...input,originalText:'two cups'},'x'.repeat(64)]);
      assert.equal(edit.state,'queued');
      const editToken=randomUUID();
      await call(db,claimSql,[editId,editToken,45]);
      await call(db,publishSql,[editId,editToken,{...plan,originalText:'two cups',items:[{...plan.items[0],logicalItemId:randomUUID(),servingAmount:2,grams:74,
        nutrition:{kcal:300,proteinG:16,carbG:48,totalFatG:5}}]}]);
      assert.equal((await db.query('select "operationOwned" from public."Message" where id=900')).rows[0].operationOwned,false);
      assert.equal((await db.query('select count(*)::int n from public."LoggedFoodItem" where "messageId"=900 and "deletedAt" is null')).rows[0].n,1);
      await db.query('update public."LoggedFoodItem" set grams=80 where "messageId"=900 and "deletedAt" is null');

      // A failed takeover marks the message failed and can be retried.
      await appMessage(903);
      const failId=randomUUID();
      await call(db,acceptSql,[owner,failId,randomUUID(),903,null,'create',{...input,attachmentIds:[903]},'y'.repeat(64)]);
      const failToken=randomUUID();
      await call(db,claimSql,[failId,failToken,45]);
      await call(db,finishSql,[failId,failToken,'failed','meal_needs_clarification',null,null]);
      const failed=(await db.query('select status,"activeOperationId" from public."Message" where id=903')).rows[0];
      assert.deepEqual([failed.status,failed.activeOperationId],['FAILED',null]);
      assert.equal((await call(db,acceptSql,[owner,randomUUID(),randomUUID(),903,null,'create',{...input,attachmentIds:[903]},'z'.repeat(64)])).state,'queued');
    } finally {await db.end()}
  });
