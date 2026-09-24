// Run only against a disposable local database named amino_phase1_test.
// Uses the installed Supabase query serializer and real PostgreSQL updates.
// The small fetch bridge is not a substitute for hosted PostgREST/RLS testing.
const { Pool } = require('pg')
const { createClient } = require('@supabase/supabase-js')
const ts = require('typescript')
const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function main() {
  const connectionString = process.env.FOOD_TEST_DATABASE_URL
  if (!connectionString) throw Error('Set FOOD_TEST_DATABASE_URL to a disposable local amino_phase1_test database')
  const url = new URL(connectionString)
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/amino_phase1_test') {
    throw Error('Refusing non-local or non-test database')
  }
  const pool = new Pool({connectionString,max:20})
  const schema = `claim_test_${randomUUID().replaceAll('-','')}`
  const table = `"${schema}"."Message"`
  const fields = new Set(['id','userId','status','content','deletedAt','consumedOn','itemsToProcess','itemsProcessed','resolvedAt'])
  const quote = name => {if(!fields.has(name))throw Error('Unexpected column');return `"${name}"`}
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`)
    await pool.query(`CREATE TABLE ${table} (id integer PRIMARY KEY, "userId" text NOT NULL, status text NOT NULL,
      content text NOT NULL, "deletedAt" timestamptz, "consumedOn" timestamptz,
      "itemsToProcess" integer, "itemsProcessed" integer, "resolvedAt" timestamptz)`)
    const supabase = createClient('http://localhost:1','test-only-placeholder',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
      assert.equal(init.method,'PATCH')
      const requestUrl = new URL(String(input))
      assert.equal(requestUrl.pathname,'/rest/v1/Message')
      const values=[]
      const bind=value=>{values.push(value);return `$${values.length}`}
      const updates=Object.entries(JSON.parse(init.body)).map(([key,value])=>`${quote(key)}=${bind(value)}`)
      const predicates=[]
      for(const [key,value] of requestUrl.searchParams) {
        if(key==='select'){assert.equal(value,'id');continue}
        if(value==='is.null')predicates.push(`${quote(key)} IS NULL`)
        else {assert.ok(value.startsWith('eq.'));predicates.push(`${quote(key)}=${bind(value.slice(3))}`)}
      }
      const result=await pool.query(`UPDATE ${table} SET ${updates.join(',')} WHERE ${predicates.join(' AND ')} RETURNING id`,values)
      // PATCH maybeSingle requests PostgREST's singular-object representation.
      if (result.rows.length === 1) return Response.json(result.rows[0])
      return Response.json({code:'PGRST116',details:'The result contains 0 rows',
        message:'JSON object requested, multiple (or no) rows returned'}, {status:406})
    }}})
    const module={exports:{}}
    const filename='src/foodMessageProcessing/common/claimFoodMessage.ts'
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS}
    }).outputText,{module,exports:module.exports,require:name=>{
      assert.equal(name,'@/utils/supabase/serverAdmin');return {createAdminSupabase:()=>supabase}
    }})
    const claim=module.exports.claimFoodMessage
    const original={id:1,userId:'owner',status:'RECEIVED',content:'rice',resolvedAt:null}
    const time='2026-09-23T12:00:00Z'
    await pool.query(`INSERT INTO ${table} (id,"userId",status,content) VALUES (1,'owner','RECEIVED','rice')`)
    const results=await Promise.all(Array.from({length:20},()=>claim(original,'owner',time)))
    assert.equal(results.filter(Boolean).length,1)
    console.log('PASS: 20 concurrent initial requests, exactly one claim')
    assert.equal(await claim({...original,status:'PROCESSING'},'owner',time),false)
    console.log('PASS: active processing cannot be reclaimed')
    await pool.query(`UPDATE ${table} SET status='RECEIVED'`)
    assert.equal(await claim(original,'intruder',time),false)
    await pool.query(`UPDATE ${table} SET "deletedAt"=now()`)
    assert.equal(await claim(original,'owner',time),false)
    console.log('PASS: foreign owner and deleted message refused')
    await pool.query(`UPDATE ${table} SET "deletedAt"=NULL,status='RESOLVED',"resolvedAt"='2026-09-23T13:00:00Z'`)
    assert.equal(await claim({...original,status:'RESOLVED',resolvedAt:'2026-09-23T12:00:00Z'},'owner',time),false)
    const edits=await Promise.all(Array.from({length:20},()=>claim({...original,status:'RESOLVED',resolvedAt:'2026-09-23T13:00:00Z'},'owner',time)))
    assert.equal(edits.filter(Boolean).length,1)
    console.log('PASS: stale edit refused; exactly one concurrent current edit claim')
  } finally {
    try {await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)} finally {await pool.end()}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
