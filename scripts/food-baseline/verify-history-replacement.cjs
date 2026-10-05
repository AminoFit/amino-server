// Runs only in an explicitly named disposable local PostgreSQL database.
const {Pool}=require('pg'),fs=require('node:fs'),assert=require('node:assert/strict');
const ts=require('typescript'),vm=require('node:vm');
const moduleValue={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/foodResolution/history/nutrients.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleValue.exports});
const nutrients=moduleValue.exports.HISTORY_NUTRIENTS;
const migration=fs.readFileSync('supabase/migrations/20260924223708_replace_food_history_atomically.sql','utf8');
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
async function main(){
  const url=new URL(process.env.FOOD_TEST_DATABASE_URL||'');
  if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/amino_history_test')throw Error('Refusing non-local or non-test database');
  const pool=new Pool({connectionString:url.toString(),max:12});
  try{
    await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$`);
    await pool.query(`DROP FUNCTION IF EXISTS public.replace_food_from_history(uuid,integer,timestamptz,jsonb,jsonb,integer[]);
      DROP TABLE IF EXISTS public."LoggedFoodItem", public."Message" CASCADE;
      CREATE TABLE public."Message"(id integer primary key,"userId" uuid not null,content text,status text,
        "consumedOn" timestamp,"resolvedAt" timestamp,"deletedAt" timestamp,"itemsProcessed" integer,"itemsToProcess" integer,"isBadFoodRequest" boolean);
      CREATE TABLE public."LoggedFoodItem"(id serial primary key,"userId" uuid not null,"messageId" integer references public."Message"(id),
        "foodItemId" integer,grams float8,${nutrients.map(k=>`"${k}" float8`).join(',')},status text,
        "consumedOn" timestamp,"deletedAt" timestamp,"updatedAt" timestamp default now(),"servingId" integer,"servingAmount" float8,"loggedUnit" text,"extendedOpenAiData" jsonb);
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT ALL ON public."Message",public."LoggedFoodItem" TO service_role;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
    await pool.query(migration);
    async function reset(){
      await pool.query('TRUNCATE public."LoggedFoodItem",public."Message" RESTART IDENTITY CASCADE');
      await pool.query(`INSERT INTO public."Message" VALUES(1,$1,'Same smoothie as yesterday','FAILED','2026-09-24 22:31',NULL,NULL,0,0,false),
        (2,$1,'Smoothie with protein, fruit, milk and chia','RESOLVED','2026-09-23 21:37','2026-09-23 21:38',NULL,4,4,false)`,[owner]);
      for(const [food,grams,kcal] of [[9632,61.8,240],[3927,150,69],[26,244,122],[381,12,58.8]]){
        await pool.query(`INSERT INTO public."LoggedFoodItem"("userId","messageId","foodItemId",grams,kcal,status,"consumedOn","updatedAt","servingAmount","loggedUnit") VALUES($1,2,$2,$3,$4,'Processed','2026-09-23 21:37','2026-09-23 21:38',1,'serving')`,[owner,food,grams,kcal]);
      }
      await pool.query(`INSERT INTO public."LoggedFoodItem"("userId","messageId","foodItemId",grams,kcal,status) VALUES($1,1,99,10,20,'Processed')`,[owner]);
    }
    const expected={content:'Same smoothie as yesterday',status:'FAILED',resolvedAt:null,consumedOn:'2026-09-24T22:31:00'};
    const source={messageId:2,content:'Smoothie with protein, fruit, milk and chia',consumedOn:'2026-09-23T21:37:00',foods:[1,2,3,4].map(id=>({id,updatedAt:'2026-09-23T21:38:00'}))};
    const values=(o={})=>[o.user||owner,1,'2026-09-24T18:31:00-04:00',JSON.stringify(o.expected||expected),JSON.stringify(o.source||source),o.ids||[1,2,3,4]];
    const run=(o={},client=pool)=>client.query('select public.replace_food_from_history($1,$2,$3,$4,$5,$6) as result',values(o));
    const active=async()=> (await pool.query('select "foodItemId",grams,kcal from public."LoggedFoodItem" where "messageId"=1 and "deletedAt" is null order by id')).rows;
    await reset();await run();let rows=await active();assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.grams),[61.8,150,244,12]);assert.equal(rows.reduce((s,r)=>s+r.kcal,0),489.8);
    const meal=(await pool.query('select status,"itemsProcessed","itemsToProcess","consumedOn"::text from public."Message" where id=1')).rows[0];
    assert.equal(meal.status,'RESOLVED');assert.equal(meal.itemsProcessed,4);assert.equal(meal.itemsToProcess,4);assert.equal(meal.consumedOn,'2026-09-24 22:31:00');
    console.log('PASS: all four ingredients and exact nutrition copied; old target removed; UTC date and completion correct');
    await assert.rejects(run());assert.equal((await active()).length,4);console.log('PASS: replay with the old target version cannot duplicate foods');
    await reset();const all=await Promise.allSettled(Array.from({length:8},()=>run()));assert.equal(all.filter(r=>r.status==='fulfilled').length,1);assert.equal((await active()).length,4);console.log('PASS: eight simultaneous replacements commit exactly once');
    const cases=[
      ['foreign owner',async()=>{}, {user:other}],
      ['active target',async()=>pool.query(`UPDATE public."Message" SET status='PROCESSING' WHERE id=1`)],
      ['deleted source',async()=>pool.query(`UPDATE public."Message" SET "deletedAt"=now() WHERE id=2`)],
      ['changed source portion',async()=>pool.query(`UPDATE public."LoggedFoodItem" SET "updatedAt"=now() WHERE id=1`)],
      ['invalid nutrition',async()=>pool.query(`UPDATE public."LoggedFoodItem" SET grams='NaN' WHERE id=1`)],
      ['incomplete source',async()=>pool.query(`UPDATE public."LoggedFoodItem" SET "deletedAt"=now() WHERE id=1`)],
      ['foreign selected food',async()=>{}, {ids:[5]}],
      ['changed target content',async()=>pool.query(`UPDATE public."Message" SET content='new edit' WHERE id=1`)]
    ];
    for(const [name,edit,options] of cases){
      await reset();await edit();await assert.rejects(run(options));
      assert.deepEqual((await active()).map(r=>r.foodItemId),[99]);console.log('PASS: '+name+' refused without deleting target foods');
    }
    await reset();
    await pool.query(`CREATE OR REPLACE FUNCTION public.reject_history_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."messageId"=1 THEN RAISE EXCEPTION 'simulated insert failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_history BEFORE INSERT ON public."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION public.reject_history_insert()`);
    await assert.rejects(run(),/simulated insert failure/);assert.deepEqual((await active()).map(r=>r.foodItemId),[99]);
    assert.equal((await pool.query('select status from public."Message" where id=1')).rows[0].status,'FAILED');
    await pool.query('DROP TRIGGER reject_history ON public."LoggedFoodItem"; DROP FUNCTION public.reject_history_insert()');
    console.log('PASS: an insertion failure rolls back old-food deletion and lifecycle changes');
    for(const role of ['anon','authenticated']){
      assert.equal((await pool.query("select has_function_privilege($1,'public.replace_food_from_history(uuid,integer,timestamptz,jsonb,jsonb,integer[])','EXECUTE') as allowed",[role])).rows[0].allowed,false);
    }
    const client=await pool.connect();try{await client.query('SET ROLE service_role');await run({},client)}finally{await client.query('RESET ROLE');client.release()}
    assert.equal((await active()).length,4);console.log('PASS: service role can call the invoker function; anonymous/authenticated roles cannot');
  }finally{await pool.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
