// Paid, explicit opt-in. Only synthetic food statements and item lists are sent.
const fs=require('node:fs'),path=require('node:path')
if(!process.argv.includes('--live'))throw Error('Usage: node scripts/food-agent/constraints-smoke.cjs --live')
const env={...require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../../.env.prod'))),...process.env}
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});require('tsconfig-paths/register')
const {extractNutritionPlan}=require('../../src/foodResolution/constraints/extract.ts')
const cases=[
 {id:'protein_bar',text:'chocolate protein bar with 25g of protein',items:['chocolate protein bar'],expected:[['identity','proteinG',25,'per_serving',[0]]]},
 {id:'kefir_target',text:'250cals of kefire',items:['kefir'],expected:[['portion','kcal',250,'consumed',[0]]]},
 {id:'salad_total',text:'700 cal Sweetgreen salad',items:['Sweetgreen salad'],expected:[['meal_total','kcal',700,'consumed',[0]]]},
 {id:'salad_with_separate_drink',text:'700 cal Sweetgreen salad plus a separate 100 cal orange juice',items:['Sweetgreen salad greens','Sweetgreen salad chicken','Sweetgreen salad dressing','orange juice'],expected:[['meal_total','kcal',700,'consumed',[0,1,2]],['portion','kcal',100,'consumed',[3]]]},
 {id:'per_100g',text:'protein powder with 25g protein per 100g',items:['protein powder'],expected:[['identity','proteinG',25,'per_100g',[0]]]},
 {id:'approximate',text:'about 250 cal of plain kefir',items:['plain kefir'],expected:[['portion','kcal',250,'consumed',[0]]],relation:'approx'},
 {id:'half_labelled_salad',text:'half of a Sweetgreen salad labelled 700 calories per salad',items:['half Sweetgreen salad'],expected:[['identity','kcal',700,'per_serving',[0]]]},
 {id:'portion_protein',text:'enough plain kefir to get 25g protein',items:['plain kefir'],expected:[['portion','proteinG',25,'consumed',[0]]]}
]
async function main(){
 const output=path.join(__dirname,'results',new Date().toISOString().replace(/[:.]/g,'-')+'-constraints');fs.mkdirSync(output,{recursive:true})
 fs.writeFileSync(path.join(output,'fixtures.json'),JSON.stringify(cases,null,2))
 const results=[]
 const caseIndex=process.argv.indexOf('--case'),selected=caseIndex<0?cases:cases.filter(c=>c.id===process.argv[caseIndex+1])
 if(!selected.length)throw Error('Unknown case')
 for(const c of selected){
  const result=await extractNutritionPlan(c.text,c.items.map(name=>({food_database_search_name:name,full_item_user_message_including_serving:name,branded:false})),{env})
  const actual=result.plan?.claims.map(x=>[x.purpose,x.nutrient,x.value,x.basis,[...x.itemIndexes].sort((a,b)=>a-b)])
  const passed=result.status==='valid'&&JSON.stringify(actual)===JSON.stringify(c.expected)&&(!c.relation||result.plan.claims.every(x=>x.relation===c.relation))
  const row={case:c.id,passed,...result};results.push(row);fs.appendFileSync(path.join(output,'results.jsonl'),JSON.stringify(row)+'\n')
  console.log(JSON.stringify({case:c.id,passed,status:result.status,durationMs:result.durationMs,actual}))
 }
 const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results}
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({output,passed:summary.passed,failed:summary.failed}));if(summary.failed)process.exitCode=1
}
main().catch(()=>{console.error('Synthetic constraint check failed; provider details omitted');process.exitCode=1})
