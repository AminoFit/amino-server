const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {assertDisposable}=require('./helpers/mealTestDb.cjs');

// Weight history (20261010000000_weight_history.sql) on a real database, as the signed-in user.
const connectionString=process.env.AMINO_WEIGHT_TEST_DATABASE_URL;
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261010000000_weight_history.sql'),'utf8');

// Just enough of Supabase: roles with its default table grants, auth.uid() from the JWT claims, "User", valid_timezone.
const BASE=`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
  DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $f$;
  CREATE TABLE public."User"(id uuid PRIMARY KEY, "weightKg" numeric, "tzIdentifier" text NOT NULL DEFAULT 'UTC');
  CREATE FUNCTION public.valid_timezone(p_name text) RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $f$
  BEGIN IF p_name IS NULL OR p_name = '' THEN RETURN NULL; END IF; PERFORM pg_catalog.now() AT TIME ZONE p_name; RETURN p_name;
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END; $f$;`;

const asUser=async(db,userId)=>{await db.query('SET ROLE authenticated');
  await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:userId})]);};
const asOwner=db=>db.query('RESET ROLE');
const sample=(kind,at,value,sourceName='Withings')=>({kind,id:randomUUID(),at,value,sourceName});
const entries=async(db,userId)=>(await db.query(`SELECT "weightKg"::float8 AS kg,"bodyFatPct"::float8 AS fat,source,"deletedAt" IS NOT NULL AS deleted
  FROM "WeightEntry" WHERE "userId"=$1 ORDER BY "measuredAt",id`,[userId])).rows;
const userWeight=async(db,userId)=>Number((await db.query(`SELECT "weightKg" FROM "User" WHERE id=$1`,[userId])).rows[0].weightKg);

test('weight history: Health import, the latest weight, deletions, profile and agent entries, the trend',
  {skip:!connectionString&&'Set AMINO_WEIGHT_TEST_DATABASE_URL for a disposable local database'},async()=>{
  assertDisposable(connectionString);
  const db=new Client({connectionString});
  await db.connect();
  try {
    await db.query(BASE);
    await db.query(migration);
    const me=randomUUID(),other=randomUUID();
    await db.query(`INSERT INTO "User"(id,"weightKg") VALUES ($1,80),($2,70)`,[me,other]);
    await asUser(db,me);

    // A scale's weigh-in: weight and body fat a few seconds apart are one entry; a later weigh-in is another.
    const day1=sample('weight','2026-09-01T07:00:00Z',80.4),fat1=sample('bodyFat','2026-09-01T07:00:20Z',21.5);
    const day2=sample('weight','2026-09-02T07:00:00Z',80.0);
    const rows=[fat1,day1,day2];
    assert.equal((await db.query('SELECT import_weight_entries($1::jsonb) n',[JSON.stringify(rows)])).rows[0].n,3);
    assert.deepEqual(await entries(db,me),[{kg:80.4,fat:21.5,source:'health',deleted:false},{kg:80,fat:null,source:'health',deleted:false}]);
    assert.equal(await userWeight(db,me),80,'the latest weigh-in is the profile weight');
    assert.equal((await db.query('SELECT import_weight_entries($1::jsonb) n',[JSON.stringify(rows)])).rows[0].n,0,'a re-import changes nothing');

    // Body fat that arrives before its weight waits in an entry, which the weight then completes.
    const fat3=sample('bodyFat','2026-09-03T07:00:10Z',21.0),day3=sample('weight','2026-09-03T07:00:00Z',79.6);
    await db.query('SELECT import_weight_entries($1::jsonb)',[JSON.stringify([fat3])]);
    await db.query('SELECT import_weight_entries($1::jsonb)',[JSON.stringify([day3])]);
    assert.deepEqual((await entries(db,me)).at(-1),{kg:79.6,fat:21,source:'health',deleted:false});
    assert.equal(await userWeight(db,me),79.6);

    // A weigh-in deleted in Health is hidden, and the profile weight goes back to the one before.
    await db.query(`SELECT import_weight_entries('[]'::jsonb,$1::jsonb)`,[JSON.stringify([day3.id])]);
    assert.equal((await entries(db,me)).at(-1).deleted,true);
    assert.equal(await userWeight(db,me),80);

    // The app saving every field with weight rounded to a whole kg is no change; a real change is a profile entry.
    await asOwner(db);
    const before=(await entries(db,me)).length;
    await db.query(`UPDATE "User" SET "weightKg"=80.4 WHERE id=$1`,[me]);
    await db.query(`UPDATE "User" SET "weightKg"=80 WHERE id=$1`,[me]);
    assert.equal(await userWeight(db,me),80.4,'the precise weight stays');
    await db.query(`UPDATE "User" SET "weightKg"=78 WHERE id=$1`,[me]);
    assert.deepEqual((await entries(db,me)).slice(before).map(row=>[row.kg,row.source]),[[80.4,'profile'],[78,'profile']]);

    // An agent records a weight with its time.
    await asUser(db,me);
    await db.query(`SELECT record_weight(77.5,'2026-10-01T08:00:00Z','agent')`);
    assert.ok((await entries(db,me)).some(row=>row.source==='agent'&&row.kg===77.5));
    assert.equal(await userWeight(db,me),78,'an older weigh-in leaves the latest weight alone');
    await assert.rejects(db.query(`SELECT record_weight(500)`),/Invalid weight/);

    // Only your own entries, and writes only through the functions.
    await assert.rejects(db.query(`INSERT INTO "WeightEntry"("userId","measuredAt","weightKg",source) VALUES ($1,now(),70,'profile')`,[me]),/permission denied/);
    await asUser(db,other);
    assert.equal((await db.query(`SELECT count(*)::int n FROM "WeightEntry"`)).rows[0].n,0);

    // The trend: an exponential moving average (alpha 0.1) of daily weights, carried over days without a weigh-in.
    const trendUser=randomUUID();
    await asOwner(db);
    await db.query(`INSERT INTO "User"(id) VALUES ($1)`,[trendUser]);
    await asUser(db,trendUser);
    await db.query('SELECT import_weight_entries($1::jsonb)',[JSON.stringify([
      sample('weight','2026-09-01T07:00:00Z',80),sample('weight','2026-09-02T07:00:00Z',81),sample('weight','2026-09-04T07:00:00Z',79)])]);
    const trend=(await db.query(`SELECT day::text,"weightKg"::float8 kg,"trendKg"::float8 trend FROM weight_trend('2026-09-01','2026-09-04')`)).rows;
    assert.deepEqual(trend,[{day:'2026-09-01',kg:80,trend:80},{day:'2026-09-02',kg:81,trend:80.1},
      {day:'2026-09-03',kg:null,trend:80.1},{day:'2026-09-04',kg:79,trend:79.99}]);
  } finally {
    await asOwner(db).catch(()=>{});
    await db.end();
  }
});
