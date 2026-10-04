const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {assertDisposable}=require('./helpers/mealTestDb.cjs');

// Agent tokens are read-only at the database (20261012000000_agent_access.sql): the same user's app session still
// writes, an agent's token (a `client_id` claim) only reads, and the setting that lets agents make changes is the
// server's to write.
const connectionString=process.env.AMINO_AGENT_TEST_DATABASE_URL;
const read=file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8');

// Just enough of Supabase: roles with its default grants, auth.uid() from the JWT claims, a storage table, the User,
// Message and FeatureFlag tables with the app's kind of policies.
const BASE=`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
  DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;
  CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $f$;
  CREATE TABLE storage.objects(id serial PRIMARY KEY, bucket_id text, name text, owner uuid);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON storage.objects TO authenticated; GRANT ALL ON SEQUENCE storage.objects_id_seq TO authenticated;
  CREATE POLICY "own folder" ON storage.objects FOR ALL TO authenticated USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
  CREATE TABLE public."User"(id uuid PRIMARY KEY, "weightKg" numeric, "calorieGoal" integer,
    "tzIdentifier" text NOT NULL DEFAULT 'UTC');
  ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "read own" ON public."User" FOR SELECT TO authenticated USING (auth.uid() = id);
  CREATE POLICY "update own" ON public."User" FOR UPDATE TO authenticated USING (auth.uid() = id);
  CREATE TABLE public."Message"(id serial PRIMARY KEY, "userId" uuid NOT NULL, content text, "deletedAt" timestamp);
  ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "own messages" ON public."Message" FOR ALL TO authenticated USING (auth.uid() = "userId")
    WITH CHECK (auth.uid() = "userId");
  CREATE TABLE public."FeatureFlag"(name text PRIMARY KEY, value text NOT NULL);
  ALTER TABLE public."FeatureFlag" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public."FeatureFlag" FROM anon, authenticated;
  CREATE FUNCTION public.valid_timezone(p_name text) RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $f$
  BEGIN IF p_name IS NULL OR p_name = '' THEN RETURN NULL; END IF; PERFORM pg_catalog.now() AT TIME ZONE p_name; RETURN p_name;
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END; $f$;`;

const as=async(db,claims)=>{await db.query('SET ROLE authenticated');
  await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify(claims)]);};
const asOwner=db=>db.query('RESET ROLE');
const count=async(db,sql,values)=>(await db.query(sql,values)).rowCount;

test('agent tokens only read; the app session still writes; agent settings are written by the server only',
  {skip:!connectionString&&'Set AMINO_AGENT_TEST_DATABASE_URL for a disposable local database'},async()=>{
  assertDisposable(connectionString);
  const db=new Client({connectionString});
  await db.connect();
  try {
    await db.query(BASE);
    await db.query(read('20261010000000_weight_history.sql'));
    await db.query(read('20261012000000_agent_access.sql'));
    await db.query(read('20261012000000_agent_access.sql')); // re-runnable
    const me=randomUUID();
    await db.query(`INSERT INTO "User"(id,"weightKg","calorieGoal") VALUES ($1,80,2000)`,[me]);
    await db.query(`INSERT INTO "Message"("userId",content) VALUES ($1,'breakfast')`,[me]);
    const app={sub:me,role:'authenticated'},agent={sub:me,role:'authenticated',client_id:'claude'};

    // The agent reads everything the user can.
    await as(db,agent);
    assert.equal(await count(db,`SELECT 1 FROM "Message"`),1);
    assert.equal(await count(db,`SELECT 1 FROM "User"`),1);
    // …but writes nothing: an insert is refused, updates and deletes match no row.
    await assert.rejects(db.query(`INSERT INTO "Message"("userId",content) VALUES ($1,'x')`,[me]),/row-level security/);
    assert.equal(await count(db,`UPDATE "Message" SET "deletedAt"=now()`),0);
    assert.equal(await count(db,`DELETE FROM "Message"`),0);
    assert.equal(await count(db,`UPDATE "User" SET "calorieGoal"=1200`),0);
    await assert.rejects(db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('userUploadedImages','a',$1)`,[me]),
      /row-level security/);
    await assert.rejects(db.query(`SELECT public.record_weight(70)`),/Agents record weights through Amino/);
    await assert.rejects(db.query(`SELECT public.import_weight_entries($1)`,[JSON.stringify([{kind:'weight',id:randomUUID(),
      at:'2026-10-01T08:00:00Z',value:70}])]),/Agents cannot import weights/);
    await assert.rejects(db.query(`SELECT public.record_weight_for($1,70,null,'agent')`,[me]),/permission denied/);
    // The setting: readable as the user, never writable with any user token.
    assert.equal(await count(db,`SELECT 1 FROM "AgentSettings"`),0);
    await assert.rejects(db.query(`INSERT INTO "AgentSettings"("userId","writesEnabled") VALUES ($1,true)`,[me]),/permission denied/);

    // The app's own session writes as before.
    await as(db,app);
    assert.equal(await count(db,`UPDATE "Message" SET content='breakfast, eggs'`),1);
    assert.equal(await count(db,`INSERT INTO "Message"("userId",content) VALUES ($1,'lunch')`,[me]),1);
    assert.equal(await count(db,`UPDATE "User" SET "calorieGoal"=2100`),1);
    assert.equal(await count(db,`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('userUploadedImages','a',$1)`,[me]),1);
    await db.query(`SELECT public.record_weight(79.5)`);
    await assert.rejects(db.query(`INSERT INTO "AgentSettings"("userId","writesEnabled") VALUES ($1,true)`,[me]),/permission denied/);
    await assert.rejects(db.query(`UPDATE "User" SET "goalWeightKg"=10`),/check constraint/);

    // The server records an agent's weigh-in for the verified user.
    await asOwner(db);
    await db.query(`SELECT public.record_weight_for($1,78,null,'agent')`,[me]);
    const weights=(await db.query(`SELECT source,"weightKg"::float8 kg FROM "WeightEntry" WHERE "userId"=$1 ORDER BY id`,[me])).rows;
    assert.deepEqual(weights.map(w=>[w.source,w.kg]),[['profile',79.5],['agent',78]]);
    assert.equal(Number((await db.query(`SELECT "weightKg" FROM "User" WHERE id=$1`,[me])).rows[0].weightKg),78);
    assert.equal((await db.query(`SELECT value FROM "FeatureFlag" WHERE name='mcp_writes'`)).rows[0].value,
      '6b005b82-88a5-457b-a1aa-60ecb1e90e21');
  } finally {
    await db.query('RESET ROLE').catch(()=>{});
    await db.end();
  }
});
