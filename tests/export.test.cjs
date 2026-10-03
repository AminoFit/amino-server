require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ex=require('../src/export/export.ts');

// A user database that answers the two MCP functions the export reads.
function fakeDb({meals,days}){
  return {rpc:async(name,args)=>{
    if (name==='mcp_list_meals') {
      const after=args.p_after_id??0, rows=meals.filter(m=>m.id>after).slice(0,args.p_limit+1)
      return {data:rows.map(m=>({eaten:"2026-10-02 12:00:00",id:m.id,meal:m})),error:null}
    }
    if (name==='mcp_daily_summary') return {data:{timezone:'America/New_York',
      days:days.filter(d=>d.date>=args.p_from&&d.date<=args.p_to)},error:null}
    throw new Error(name)
  }}
}

test('foods: one row per logged food, every page, unknown nutrients empty and 0 kept',async()=>{
  const meals=Array.from({length:150},(_,i)=>({id:i+1,localDate:'2026-10-02',localTime:'08:15',text:'=2+2, "eggs"',input:'text',
    items:[{food:'eggs',brand:null,amount:1,unit:'large egg',grams:50,kcal:72,zincMg:0.65,vitaminKMcg:0}]}))
  const lines=(await ex.foodsCsv(fakeDb({meals,days:[]}),'2026-10-03')).trim().split('\r\n')
  assert.equal(lines.length,151,'header and 150 foods across two pages')
  const header=lines[0].split(','),row=lines[1]
  assert.ok(row.includes(`"'=2+2, ""eggs"""`),'text is quoted, and can\'t run as a formula')
  const cells=row.replace(/"[^"]*(""[^"]*)*"/g,'Q').split(',')
  assert.equal(cells[header.indexOf('zincMg')],'0.65')
  assert.equal(cells[header.indexOf('vitaminKMcg')],'0','a measured 0 stays 0')
  assert.equal(cells[header.indexOf('vitaminB9Mcg')],'','unknown stays empty')
});

test('days: totals from every year, with the partial ones named',async()=>{
  const days=[{date:'2025-03-01',meals:2,foods:5,kcal:1800,nutrients:{zincMg:3}},
    {date:'2026-10-02',meals:4,foods:20,kcal:2400,sodiumMg:3240,nutrients:{zincMg:4.98},incomplete:{zincMg:'10 of 20 foods'}}]
  const lines=(await ex.daysCsv(fakeDb({meals:[],days}),'2026-10-03')).trim().split('\r\n')
  assert.equal(lines.length,3)
  assert.ok(lines[2].startsWith('2026-10-02,4,20,2400'))
  assert.ok(lines[2].endsWith('zincMg 10 of 20 foods'))
  assert.deepEqual(ex.yearChunks('2025-01-01','2026-03-01'),[['2025-01-01','2026-01-01'],['2026-01-02','2026-03-01']])
});
