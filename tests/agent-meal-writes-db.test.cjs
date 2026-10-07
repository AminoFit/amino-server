const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {assertDisposable}=require('./helpers/mealTestDb.cjs');

// Agent meal changes (20261013000000_agent_meal_writes.sql) on a real database, called as the server (service role):
// moving, re-amounting, removing and adding foods, deleting and restoring, and refusing meals Amino still owns.
const connectionString=process.env.AMINO_AGENT_MEALS_TEST_DATABASE_URL;
const read=file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8');
const nutrients=['kcal','proteinG','carbG','totalFatG','satFatG','transFatG','unsatFatG','polyunsatFatG','monounsatFatG','fiberG',
  'sugarG','addedSugarG','waterMl','vitaminAMcg','vitaminCMg','vitaminDMcg','vitaminEMg','vitaminKMcg','vitaminB1Mg','vitaminB2Mg',
  'vitaminB3Mg','vitaminB5Mg','vitaminB6Mg','vitaminB7Mcg','vitaminB9Mcg','vitaminB12Mcg','calciumMg','ironMg','magnesiumMg',
  'phosphorusMg','potassiumMg','sodiumMg','zincMg','copperMg','manganeseMg','seleniumMcg','iodineMcg','cholesterolMg','omega3Mg',
  'omega6Mg','caffeineMg','alcoholG'];
// insert_priced_food_row as 20261004000000_custom_foods_and_recipes.sql defines it.
const priced=read('20261004000000_custom_foods_and_recipes.sql')
  .match(/CREATE OR REPLACE FUNCTION public\.insert_priced_food_row[\s\S]*?\$function\$;/)[0];

const BASE=`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
  DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $f$;
  CREATE TYPE public."Role" AS ENUM ('Assistant', 'User', 'System', 'Function');
  CREATE TYPE public."MessageType" AS ENUM ('CONVERSATION', 'ASSISTANT', 'FOOD_LOG_REQUEST');
  CREATE TYPE public."MessageStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'RESOLVED', 'FAILED');
  CREATE TABLE public."User"(id uuid PRIMARY KEY, "tzIdentifier" text NOT NULL DEFAULT 'UTC');
  CREATE TABLE public."FeatureFlag"(name text PRIMARY KEY, value text NOT NULL);
  CREATE TABLE public."Message"(id serial PRIMARY KEY, "userId" uuid NOT NULL, role public."Role" NOT NULL DEFAULT 'User',
    "messageType" public."MessageType" NOT NULL DEFAULT 'FOOD_LOG_REQUEST', content text NOT NULL DEFAULT '',
    status public."MessageStatus" NOT NULL DEFAULT 'RESOLVED', "consumedOn" timestamp, "createdAt" timestamp(3) NOT NULL DEFAULT now(),
    "resolvedAt" timestamp(3), "deletedAt" timestamp, hasimages boolean NOT NULL DEFAULT false, "isAudio" boolean,
    "itemsProcessed" integer, "itemsToProcess" integer, "operationOwned" boolean NOT NULL DEFAULT false,
    "activeOperationId" uuid);
  CREATE TABLE public."FoodItem"(id integer PRIMARY KEY, name text NOT NULL, brand text, "privateToUserId" uuid, "archivedAt" timestamp, "previousVersionId" integer);
  CREATE TABLE public."Serving"(id integer PRIMARY KEY, "servingName" text NOT NULL);
  CREATE TABLE public."LoggedFoodItem"(id serial PRIMARY KEY, "userId" uuid NOT NULL, "messageId" integer REFERENCES public."Message"(id),
    "foodItemId" integer, "servingId" integer, "servingAmount" float8, "loggedUnit" text, grams float8 NOT NULL DEFAULT 0,
    status text, "consumedOn" timestamp, "deletedAt" timestamp, local_id uuid, "logicalItemId" uuid,
    "publishedRevision" bigint NOT NULL DEFAULT 0, "updatedAt" timestamp DEFAULT now(),
    ${nutrients.map(key=>`"${key}" float8`).join(',')});
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;`;

const one=async(db,sql,values)=>(await db.query(sql,values)).rows[0];
const item=(foodItemId,grams,kcal)=>({foodItemId,grams,servingId:null,servingAmount:grams,loggedUnit:'g',nutrition:{kcal,proteinG:1}});

test('agents move, re-amount, remove, add, delete and restore meals the way the app does',
  {skip:!connectionString&&'Set AMINO_AGENT_MEALS_TEST_DATABASE_URL for a disposable local database'},async()=>{
  assertDisposable(connectionString);
  const db=new Client({connectionString});
  await db.connect();
  try {
    await db.query(BASE);
    await db.query(read('20261002000000_mcp_access.sql'));
    await db.query(priced);
    await db.query(read('20261013000000_agent_meal_writes.sql'));
    await db.query(read('20261015000000_food_lineage_and_visibility.sql'));  // agent_add_meal_foods through food_visible
    const me=randomUUID(),other=randomUUID();
    await db.query(`INSERT INTO "User"(id) VALUES ($1),($2)`,[me,other]);
    await db.query(`INSERT INTO "FoodItem"(id,name,"privateToUserId","archivedAt") VALUES (1,'Eggs',null,null),(2,'Toast',null,null),
      (3,'Mine',$1,null),(4,'Theirs',$2,null),(5,'Old',null,now())`,[me,other]);
    const meal=async(userId,extra={})=>(await one(db,`INSERT INTO "Message"("userId","consumedOn","operationOwned",status,"itemsToProcess",
      "itemsProcessed") VALUES ($1,'2026-10-01 08:00',$2,$3,2,2) RETURNING id`,[userId,extra.owned??false,extra.status??'RESOLVED'])).id;
    const food=async(userId,messageId,foodItemId,grams)=>(await one(db,`INSERT INTO "LoggedFoodItem"("userId","messageId","foodItemId",
      grams,"consumedOn",status,kcal,"vitaminCMg") VALUES ($1,$2,$3,$4,'2026-10-01 08:00','Processed',$4,5) RETURNING id`,
      [userId,messageId,foodItemId,grams])).id;
    const breakfast=await meal(me), eggs=await food(me,breakfast,1,100), toast=await food(me,breakfast,2,30);
    const owned=await meal(me,{owned:true}); await food(me,owned,1,50);
    const pending=await meal(me,{status:'PROCESSING'});
    const theirs=await meal(other); const theirEggs=await food(other,theirs,1,50);
    const call=(fn,...args)=>db.query(`SELECT public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS r`,args).then(r=>r.rows[0].r);

    // A planned meal can sit ahead; a year out is a typo.
    await call('agent_move_meal',me,breakfast,new Date(Date.now()+30*86400000).toISOString().replace('T',' ').replace('Z',''));
    await assert.rejects(call('agent_move_meal',me,breakfast,'2030-01-01 08:00'),/invalid_time/);
    // Moving a meal moves its foods.
    await call('agent_move_meal',me,breakfast,'2026-10-01 12:30');
    assert.equal((await one(db,`SELECT count(*)::int n FROM "LoggedFoodItem" WHERE "messageId"=$1 AND "consumedOn"='2026-10-01 12:30'`,[breakfast])).n,2);
    // A new amount replaces every nutrient (vitamin C from the old amount doesn't linger).
    await call('agent_set_meal_food',me,eggs,JSON.stringify({...item(1,150,210),servingAmount:3,loggedUnit:'egg'}));
    assert.deepEqual(await one(db,`SELECT grams,kcal,"vitaminCMg","servingAmount","loggedUnit" FROM "LoggedFoodItem" WHERE id=$1`,[eggs]),
      {grams:150,kcal:210,vitaminCMg:null,servingAmount:3,loggedUnit:'egg'});
    await assert.rejects(call('agent_set_meal_food',me,eggs,JSON.stringify(item(2,150,210))),/invalid_amount/,'the food stays the same food');
    // Adding foods at the meal's time; only foods the user may use.
    const added=await call('agent_add_meal_foods',me,breakfast,JSON.stringify([item(3,20,40)]));
    assert.equal(added.length,1);
    assert.equal((await one(db,`SELECT "consumedOn"::text t FROM "LoggedFoodItem" WHERE id=$1`,[added[0]])).t,'2026-10-01 12:30:00');
    await assert.rejects(call('agent_add_meal_foods',me,breakfast,JSON.stringify([item(4,20,40)])),/food_unavailable/);
    await assert.rejects(call('agent_add_meal_foods',me,breakfast,JSON.stringify([item(5,20,40)])),/food_unavailable/,'not an archived food');
    // Removing foods, but never the last.
    await call('agent_remove_meal_food',me,toast);
    await call('agent_remove_meal_food',me,added[0]);
    await assert.rejects(call('agent_remove_meal_food',me,eggs),/last_food/);
    // Other users' meals and meals Amino still owns or is processing are refused.
    await assert.rejects(call('agent_delete_meal',me,theirs),/meal_unavailable/);
    await assert.rejects(call('agent_set_meal_food',me,theirEggs,JSON.stringify(item(1,10,10))),/food_unavailable/);
    await assert.rejects(call('agent_move_meal',me,owned,'2026-10-01 09:00'),/meal_busy/);
    await assert.rejects(call('agent_delete_meal',me,pending),/meal_busy/);
    // Delete and restore: the foods deleted with the meal come back; one removed earlier stays removed.
    await call('agent_delete_meal',me,breakfast);
    assert.equal((await one(db,`SELECT count(*)::int n FROM "LoggedFoodItem" WHERE "messageId"=$1 AND "deletedAt" IS NULL`,[breakfast])).n,0);
    await assert.rejects(call('agent_move_meal',me,breakfast,'2026-10-01 09:00'),/meal_unavailable/,'a deleted meal is gone');
    await db.query(`UPDATE "LoggedFoodItem" SET "deletedAt"="deletedAt"-interval '1 hour' WHERE id=$1`,[toast]);
    await call('agent_restore_meal',me,breakfast);
    const live=(await db.query(`SELECT id FROM "LoggedFoodItem" WHERE "messageId"=$1 AND "deletedAt" IS NULL ORDER BY id`,[breakfast])).rows;
    assert.deepEqual(live.map(r=>r.id),[eggs]);
    await db.query(`UPDATE "Message" SET "deletedAt"=now()-interval '31 days' WHERE id=$1`,[pending]);
    await db.query(`UPDATE "Message" SET status='RESOLVED' WHERE id=$1`,[pending]);
    await assert.rejects(call('agent_restore_meal',me,pending),/restore_expired/);

    // Agents read who logged a meal and each food's id.
    await db.query(`UPDATE "Message" SET "agentClientId"='claude-client',"agentName"='Claude' WHERE id=$1`,[breakfast]);
    await db.query('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:me})]);
    const [shown]=(await db.query(`SELECT * FROM public.mcp_get_meals($1)`,[[breakfast]])).rows.map(r=>r.mcp_get_meals);
    assert.equal(shown.loggedBy,'Claude');
    assert.equal(shown.input,'agent');
    assert.equal(shown.items[0].foodId,1);
    // The functions are the server's alone.
    await assert.rejects(db.query(`SELECT public.agent_delete_meal($1,$2)`,[me,breakfast]),/permission denied/);
  } finally {
    await db.query('RESET ROLE').catch(()=>{});
    await db.end();
  }
});
