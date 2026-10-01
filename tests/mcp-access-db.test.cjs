const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {assertDisposable}=require('./helpers/mealTestDb.cjs');

// The MCP read functions and the sync feed (20261002000000_mcp_access.sql), on a real database, as the user.
const connectionString=process.env.AMINO_MCP_TEST_DATABASE_URL;
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261002000000_mcp_access.sql'),'utf8');
const dailyMicros=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005000000_mcp_daily_micronutrients.sql'),'utf8');
const consistency=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005020000_nutrition_consistency.sql'),'utf8');
// The nutrient keys as src/nutrition/spec.ts lists them, which the SQL list must equal.
const specKeys=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/nutrition/spec.ts'),'utf8')
  .match(/HISTORY_NUTRIENTS = (\[[^\]]*\])/)[1].replace(/\s+/g,''));

// Just enough of the Supabase schema: roles, auth.uid() from the JWT claims, the tables with their read policies.
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
  CREATE TABLE public."Message"(id serial PRIMARY KEY, "userId" uuid NOT NULL, role public."Role" NOT NULL DEFAULT 'User',
    "messageType" public."MessageType" NOT NULL DEFAULT 'FOOD_LOG_REQUEST', content text NOT NULL DEFAULT '',
    status public."MessageStatus" NOT NULL DEFAULT 'RESOLVED', "consumedOn" timestamp, "createdAt" timestamp(3) NOT NULL DEFAULT now(),
    "resolvedAt" timestamp(3), "deletedAt" timestamp, hasimages boolean NOT NULL DEFAULT false, "isAudio" boolean,
    "itemsProcessed" integer);
  CREATE TABLE public."FoodItem"(id integer PRIMARY KEY, name text NOT NULL, brand text);
  CREATE TABLE public."Serving"(id integer PRIMARY KEY, "servingName" text NOT NULL);
  CREATE TABLE public."LoggedFoodItem"(id serial PRIMARY KEY, "userId" uuid NOT NULL, "messageId" integer REFERENCES public."Message"(id),
    "foodItemId" integer, "servingId" integer, "servingAmount" float8, "loggedUnit" text, grams float8 NOT NULL DEFAULT 0,
    kcal float8, "proteinG" float8, "carbG" float8, "totalFatG" float8, "satFatG" float8, "fiberG" float8, "sugarG" float8,
    "sodiumMg" float8, "vitaminCMg" float8, "alcoholG" float8, "caffeineMg" float8, "waterMl" float8,
    "deletedAt" timestamptz, "updatedAt" timestamp(3) NOT NULL DEFAULT now());
  CREATE TABLE public."FeatureFlag"(name text PRIMARY KEY, value text NOT NULL);
  ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY; ALTER TABLE public."LoggedFoodItem" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own ON public."Message" FOR SELECT USING (auth.uid() = "userId");
  CREATE POLICY own ON public."LoggedFoodItem" FOR SELECT USING (auth.uid() = "userId");
  CREATE POLICY own ON public."User" FOR SELECT USING (auth.uid() = id);
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`;

const one=async(db,sql,values)=>(await db.query(sql,values)).rows[0];
const asUser=async(db,userId)=>{await db.query('SET ROLE authenticated');
  await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:userId})]);};
const asOwner=db=>db.query('RESET ROLE');

test('agents read their own meals by local day, with totals, pages, daily sums and a change feed',
  {skip:!connectionString&&'Set AMINO_MCP_TEST_DATABASE_URL for a disposable local database'},async()=>{
    assertDisposable(connectionString);
    const db=new Client({connectionString});
    await db.connect();
    try {
      await db.query(BASE);
      await db.query(migration);
      await db.query(dailyMicros);
      // Its catalogue functions name types this schema lacks; the day totals below run for real.
      await db.query('SET check_function_bodies = off'); await db.query(consistency); await db.query('RESET check_function_bodies');
      assert.deepEqual((await one(db,`SELECT public.nutrition_keys() AS k`)).k,specKeys,'SQL and spec.ts list the same nutrients');
      const rounded=(await one(db,`SELECT public.nutrition_round('kcal',105.4) a,public.nutrition_round('proteinG',12.345) b,
        public.nutrition_round('sodiumMg',2312.7) c,public.nutrition_round('vitaminB12Mcg',2.4321) d,public.nutrition_round('copperMg',0.9132) e`));
      assert.deepEqual(Object.values(rounded).map(Number),[105,12.3,2313,2.43,0.913]);
      const me=randomUUID(),other=randomUUID();
      await db.query(`INSERT INTO public."User"(id,"tzIdentifier") VALUES($1,'America/New_York'),($2,'UTC')`,[me,other]);
      await db.query(`INSERT INTO public."FoodItem"(id,name,brand) VALUES(1,'Oat milk','Oatly'),(2,'Banana',null)`);
      await db.query(`INSERT INTO public."Serving"(id,"servingName") VALUES(1,'cup')`);
      const meal=async(userId,consumedOn,extra={})=>(await one(db,
        `INSERT INTO public."Message"("userId","consumedOn",content,"messageType",role,"deletedAt",hasimages)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[userId,consumedOn,extra.content??'breakfast',
          extra.type??'FOOD_LOG_REQUEST',extra.role??'User',extra.deletedAt??null,extra.photo??false])).id;
      const food=(userId,messageId,foodItemId,values)=>db.query(
        `INSERT INTO public."LoggedFoodItem"("userId","messageId","foodItemId","servingId","servingAmount",grams,kcal,"proteinG","carbG","totalFatG","vitaminCMg","deletedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[userId,messageId,foodItemId,values.servingId??null,
          values.amount??1,values.grams,values.kcal,values.protein??0,values.carb??0,values.fat??0,values.vitC??null,values.deletedAt??null]);

      // 23:30 in New York on the 29th is 03:30 UTC on the 30th.
      const lateSnack=await meal(me,'2026-09-30 03:30:00',{content:'late snack'});
      await food(me,lateSnack,2,{grams:118,kcal:105,carb:27,protein:1.3,fat:0.4,vitC:10.3});
      const lunch=await meal(me,'2026-09-30 16:00:00',{content:'',photo:true});
      await food(me,lunch,1,{servingId:1,amount:1,grams:240,kcal:120,protein:3,carb:16,fat:5});
      await food(me,lunch,2,{grams:118,kcal:105,carb:27,protein:1.3,fat:0.4});
      await food(me,lunch,2,{grams:500,kcal:999,deletedAt:new Date()});
      const deleted=await meal(me,'2026-09-30 17:00:00',{deletedAt:'2026-09-30 18:00:00'});
      const chat=await meal(me,'2026-09-30 17:30:00',{type:'CONVERSATION'});
      const theirs=await meal(other,'2026-09-30 16:00:00');
      await food(other,theirs,2,{grams:100,kcal:89});
      await db.query(`UPDATE public."MealChange" SET "changedAt"=now()-interval '10 minutes'+("messageId"*interval '1 second')`);

      await asUser(db,me);
      // One local day: only lunch (the late snack belongs to the 29th; chat and deleted meals are left out).
      const day=(await db.query(`SELECT * FROM public.mcp_list_meals('2026-09-30','2026-09-30')`)).rows;
      assert.deepEqual(day.map(row=>row.id),[lunch]);
      const shown=day[0].meal;
      assert.equal(shown.localDate,'2026-09-30');
      assert.equal(shown.localTime,'12:00');
      assert.equal(shown.eatenAt,'2026-09-30T16:00:00Z');
      assert.equal(shown.input,'photo');
      assert.equal(shown.status,'logged');
      assert.equal(shown.text,undefined,'an empty caption is left out');
      assert.equal(shown.items.length,2,'a deleted food is left out');
      assert.deepEqual(shown.items[0],{id:shown.items[0].id,food:'Oat milk',brand:'Oatly',amount:1,unit:'cup',grams:240,
        kcal:120,proteinG:3,carbG:16,totalFatG:5});
      assert.deepEqual(shown.totals,{kcal:225,proteinG:4.3,carbG:43,totalFatG:5.4});

      // Pages over two days, in eating order: the extra row signals the next page.
      const first=(await db.query(`SELECT * FROM public.mcp_list_meals('2026-09-29','2026-09-30',NULL,NULL,1)`)).rows;
      assert.deepEqual(first.map(row=>row.id),[lateSnack,lunch]);
      assert.equal(first[0].meal.localDate,'2026-09-29');
      const second=(await db.query(`SELECT * FROM public.mcp_list_meals('2026-09-29','2026-09-30',$1,$2,1)`,
        [first[0].eaten,first[0].id])).rows;
      assert.deepEqual(second.map(row=>row.id),[lunch]);

      // Every nutrient only when asked; other users' meals never.
      const detail=(await db.query(`SELECT * FROM public.mcp_get_meals($1)`,[[lateSnack,theirs]])).rows.map(row=>row.mcp_get_meals);
      assert.deepEqual(detail.map(m=>m.id),[lateSnack]);
      assert.equal(detail[0].items[0].vitaminCMg,10.3);
      assert.equal(shown.items[1].vitaminCMg,undefined);

      const summary=(await one(db,`SELECT public.mcp_daily_summary('2026-09-29','2026-09-30') AS s`)).s;
      assert.equal(summary.timezone,'America/New_York');
      assert.deepEqual(summary.days.map(d=>[d.date,d.meals,d.kcal]),[['2026-09-29',1,105],['2026-09-30',1,225]]);
      assert.equal(summary.days[0].nutrients,undefined,'vitamins and minerals only when asked');
      const everything=(await one(db,`SELECT public.mcp_daily_summary('2026-09-29','2026-09-30',true) AS s`)).s;
      assert.deepEqual(everything.days.map(d=>d.nutrients),summary.days.map(d=>d.date==='2026-09-29'?{vitaminCMg:10.3}:{}));

      // The feed: every meal once, oldest change first, the deleted one as a tombstone.
      const feed=(await db.query(`SELECT * FROM public.mcp_meal_changes()`)).rows;
      assert.deepEqual(feed.map(row=>row.id),[lateSnack,lunch,deleted]);
      assert.deepEqual(feed[2].meal,{id:deleted,deleted:true});
      const cursor=feed[2];
      assert.equal((await db.query(`SELECT * FROM public.mcp_meal_changes($1,$2)`,[cursor.changedAt,cursor.id])).rows.length,0);
      await assert.rejects(db.query(`INSERT INTO public."MealChange" VALUES($1,$2,now())`,[chat,me]),/permission denied/);

      // Editing a food moves its meal to the end of the feed, but only once the change has settled.
      await asOwner(db);
      const before=(await one(db,`SELECT "changedAt" FROM public."MealChange" WHERE "messageId"=$1`,[lateSnack])).changedAt;
      await db.query(`UPDATE public."Message" SET "itemsProcessed"=1 WHERE id=$1`,[lateSnack]);
      assert.deepEqual((await one(db,`SELECT "changedAt" FROM public."MealChange" WHERE "messageId"=$1`,[lateSnack])).changedAt,before,
        'bookkeeping columns do not count as a change');
      await db.query(`UPDATE public."LoggedFoodItem" SET grams=150 WHERE "messageId"=$1`,[lateSnack]);
      await asUser(db,me);
      assert.equal((await db.query(`SELECT * FROM public.mcp_meal_changes($1,$2)`,[cursor.changedAt,cursor.id])).rows.length,0,
        'a change from the last 15 seconds waits');
      await asOwner(db);
      await db.query(`UPDATE public."MealChange" SET "changedAt"=now()-interval '20 seconds' WHERE "messageId"=$1`,[lateSnack]);
      await asUser(db,me);
      const later=(await db.query(`SELECT * FROM public.mcp_meal_changes($1,$2)`,[cursor.changedAt,cursor.id])).rows;
      assert.deepEqual(later.map(row=>[row.id,row.meal.items[0].grams]),[[lateSnack,150]]);

      // A bad timezone in the profile falls back to UTC rather than failing.
      await asOwner(db);
      await db.query(`UPDATE public."User" SET "tzIdentifier"='Mars/Olympus' WHERE id=$1`,[me]);
      await asUser(db,me);
      assert.equal((await one(db,`SELECT public.mcp_daily_summary('2026-09-30','2026-09-30') AS s`)).s.timezone,'UTC');
    } finally {
      await db.query('RESET ROLE').catch(()=>{});
      await db.end();
    }
  });
