// Builds the meal-operation schema in a disposable local PostgreSQL database:
// the base tables, the test fixture and the real migrations, in order.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');

const root=path.join(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exportsOf=file=>{const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module.exports});
  return module.exports};

const MIGRATIONS=['20260924232454_meal_operations.sql','20260926000000_meal_takeover.sql'];

function assertDisposable(connectionString){
  const url=new URL(connectionString);
  if(!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Refusing a non-local database');
}

async function buildMealSchema(client){
  const nutrients=exportsOf('src/foodResolution/history/nutrients.ts').HISTORY_NUTRIENTS;
  await client.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE public."Message"(id integer primary key,"userId" uuid not null,content text,status text,
      "consumedOn" timestamp,"resolvedAt" timestamp,"deletedAt" timestamp,"itemsProcessed" integer,"itemsToProcess" integer,
      "isBadFoodRequest" boolean,"createdAt" timestamp default now());
    CREATE TABLE public."LoggedFoodItem"(id serial primary key,"userId" uuid not null,"messageId" integer references public."Message"(id),
      "foodItemId" integer,grams float8,${nutrients.map(k=>`"${k}" float8`).join(',')},status text,
      "consumedOn" timestamp,"deletedAt" timestamp,"updatedAt" timestamp default now(),"servingId" integer,"servingAmount" float8,
      "loggedUnit" text,"extendedOpenAiData" jsonb);
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
  // The fixture converts Message status to the real enum shape it expects.
  await client.query(read('tests/fixtures/meal-operations-base.sql'));
  for(const file of MIGRATIONS) await client.query(read(`supabase/migrations/${file}`));
}

module.exports={assertDisposable,buildMealSchema};
