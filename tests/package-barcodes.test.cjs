require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {addPackageBarcode}=require('../src/foodSearch/packageBarcodes');

// Package barcodes (2026-10-04-package-barcodes-plan.md): another barcode is added to a food only when it is the same
// product in another package.
const fairlife={id:15321,brand:'fairlife',gtin:'00856312002795',privateToUserId:null,archivedAt:null,defaultServingWeightGram:240,
  kcalPerServing:140,Serving:[{id:27819,servingWeightGram:240,defaultServingAmount:1},{id:27859,servingWeightGram:414,defaultServingAmount:1}]};

function fakeDb({food=fairlife,taken=[]}={}){
  const calls={inserted:[],updated:0};
  const db={from:table=>{let byGtin=false;const q={select:()=>q,is:()=>q,or:()=>q,order:()=>q,
    eq:column=>{byGtin=column==='gtin';return q},
    limit:async()=>({data:byGtin?taken.filter(row=>row.table===table):[],error:null}),
    maybeSingle:async()=>({data:food,error:null}),
    insert:async value=>{calls.inserted.push(value);return {error:null}},
    update:()=>({eq:async()=>{calls.updated++;return {error:null}}})};return q}};
  return {db,calls};
}

test('the 14 fl oz bottle becomes another package of the fairlife food, at its 414 g bottle serving',async()=>{
  const {db,calls}=fakeDb();
  // Open Food Facts: 250 kcal per 414 g bottle (60.4 kcal/100 g) against the food's 58.3.
  const added=await addPackageBarcode(db,15321,{gtin:'00811620020398',source:'Online',kcal:250,grams:414,packageGrams:414});
  assert.deepEqual(added,{status:'added',servingId:27859});
  assert.deepEqual(calls.inserted[0],{gtin:'00811620020398',foodItemId:15321,servingId:27859,privateToUserId:null,source:'Online'});
  assert.equal(calls.updated,1,'lastUpdated moves so phones pick it up');
});

test('a different product, a generic food or a barcode another food carries is never added',async()=>{
  let {db,calls}=fakeDb();
  assert.equal((await addPackageBarcode(db,15321,{gtin:'00811620020398',source:'Online',kcal:500,grams:414})).reason,'different_values',
    'twice the energy per gram is another recipe');
  ({db,calls}=fakeDb({food:{...fairlife,brand:null,gtin:'00000000000017'}}));
  assert.equal((await addPackageBarcode(db,15321,{gtin:'00811620020398',source:'Online',kcal:250,grams:414})).reason,'generic_food');
  ({db,calls}=fakeDb({taken:[{table:'FoodBarcode',foodItemId:999}]}));
  assert.equal((await addPackageBarcode(db,15321,{gtin:'00811620020398',source:'Online',kcal:250,grams:414})).reason,'other_food');
  assert.equal(calls.inserted.length,0);
  ({db}=fakeDb());
  assert.equal((await addPackageBarcode(db,15321,{gtin:'00856312002795',source:'Online',kcal:140,grams:240})).status,'main');
});

test('without a known package size, the barcode points at the food alone',async()=>{
  const {db,calls}=fakeDb();
  assert.deepEqual(await addPackageBarcode(db,15321,{gtin:'00811620020398',source:'photo',kcal:140,grams:240}),{status:'added',servingId:null});
  assert.equal(calls.inserted[0].servingId,null);
});

test('FoodBarcode: users read shared barcodes and their own, never write; one barcode is one shared product',
  {skip:!process.env.AMINO_AGENT_TEST_DATABASE_URL&&'Set AMINO_AGENT_TEST_DATABASE_URL for a disposable local database'},async()=>{
  const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
  const {assertDisposable}=require('./helpers/mealTestDb.cjs');
  assertDisposable(process.env.AMINO_AGENT_TEST_DATABASE_URL);
  const db=new Client({connectionString:process.env.AMINO_AGENT_TEST_DATABASE_URL});
  await db.connect();
  try {
    await db.query(`DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
      DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $f$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $f$;
      CREATE TABLE public."FoodItem"(id integer PRIMARY KEY); CREATE TABLE public."Serving"(id integer PRIMARY KEY);`);
    await db.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261014060000_food_package_barcodes.sql'),'utf8'));
    const me=randomUUID(),other=randomUUID();
    await db.query(`INSERT INTO "FoodItem" VALUES (1),(2),(3); INSERT INTO "Serving" VALUES (10)`);
    await db.query(`INSERT INTO "FoodBarcode"(gtin,"foodItemId","servingId","privateToUserId",source) VALUES
      ('00811620020398',1,10,null,'Online'),('00000000000017',2,null,$1,'user'),('00000000000024',3,null,$2,'user')`,[me,other]);
    await assert.rejects(db.query(`INSERT INTO "FoodBarcode"(gtin,"foodItemId",source) VALUES ('00811620020398',2,'Online')`),
      /duplicate key/,'a barcode is one shared product');
    await db.query(`INSERT INTO "FoodBarcode"(gtin,"foodItemId","privateToUserId",source) VALUES ('00811620020398',2,$1,'user')`,[me]);
    await db.query('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:me})]);
    const seen=(await db.query(`SELECT gtin,"foodItemId" FROM "FoodBarcode" ORDER BY gtin,"foodItemId"`)).rows;
    assert.deepEqual(seen.map(r=>`${r.gtin}:${r.foodItemId}`),['00000000000017:2','00811620020398:1','00811620020398:2'],
      "shared barcodes and the user's own, not another user's");
    await assert.rejects(db.query(`INSERT INTO "FoodBarcode"(gtin,"foodItemId",source) VALUES ('00000000000031',1,'x')`),/permission denied/);
    await assert.rejects(db.query(`INSERT INTO "FoodBarcode"(gtin,"foodItemId",source) VALUES ('123',1,'x')`),/permission denied|check/);
  } finally {
    await db.query('RESET ROLE').catch(()=>{});
    await db.end();
  }
});
