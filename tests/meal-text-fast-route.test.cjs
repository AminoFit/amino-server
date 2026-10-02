const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')

function load(file,stubs={}){
  const source=fs.readFileSync(path.join(__dirname,'..','src',file),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const module={exports:{}}
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
    if(name in stubs)return stubs[name]
    throw Error(`Unstubbed dependency: ${name}`)
  },AbortSignal,console,performance})
  return module.exports
}
const usableServing=s=>s.servingWeightGram>0&&Number(s.defaultServingAmount)>0
const fast=load('mealResolution/textFastRoute.ts',{'@/ai/jev':{},'./evidence':{usableServing}})
const flag=load('mealResolution/fastRouteFlag.ts',{'@/utils/supabase/serverAdmin':{createAdminSupabase(){}}})
const plain=value=>JSON.parse(JSON.stringify(value))

const food=(id,name,servings=[],brand=null)=>({id,name,brand,Serving:servings.map(([servingName,grams,amount],i)=>
  ({id:id*10+i,foodItemId:id,servingName,servingWeightGram:grams,defaultServingAmount:amount??1}))})
const oil=food(2,'Olive oil',[['tbsp',13.5]]),egg=food(5,'Egg, boiled',[['egg',50]]),chicken=food(1,'Chicken breast, raw')
const regular=food(13562,'Complete Protein 26 G High Protein Milk Shake, Vanilla',[['bottle',414]],'Core Power')
const elite=food(1002,'Vanilla Core Power Elite High Protein Milk Shake',[['bottle',414]],'Fairlife')

test('amounts at the start of the user words',()=>{
  const amount=q=>{const r=fast.parseAmount(q);return r&&[Math.round(r.amount*1000)/1000,r.rest.join(' ')]}
  assert.deepEqual(amount('200 g chicken breast'),[200,'g chicken breast'])
  assert.deepEqual(amount('153g cooked rice'),[153,'g cooked rice'])
  assert.deepEqual(amount('1.16/2 lb chicken breast raw'),[0.58,'lb chicken breast raw'])
  assert.deepEqual(amount('1 1/2 cups of rice'),[1.5,'cups rice'])
  assert.deepEqual(amount('a slice of toast'),[1,'slice toast'])
  assert.deepEqual(amount('Half a core power vanilla'),[0.5,'core power vanilla'])
  assert.deepEqual(amount('½ cup milk'),[0.5,'cup milk'])
  assert.equal(fast.parseAmount('Banana'),null)
  assert.equal(fast.parseAmount('0 g'),null)
  // A household unit without a number is one of it (meal 30393: "tbsp avocado oil").
  assert.deepEqual(amount('tbsp avocado oil'),[1,'tbsp avocado oil'])
  assert.deepEqual(amount('cup of rice'),[1,'cup rice'])
  assert.equal(fast.parseAmount('g chicken'),null)
})

test('a stated mass is computed, a named serving is used, anything else is an estimate',()=>{
  assert.deepEqual(plain(fast.itemQuantity('1.16/2 lb chicken breast raw',chicken,263)),{kind:'mass',grams:263.1})
  assert.deepEqual(plain(fast.itemQuantity('1 tbsp olive oil',oil,14)),{kind:'serving',servingId:20,amount:1})
  assert.deepEqual(plain(fast.itemQuantity('2 boiled eggs',egg,100)),{kind:'serving',servingId:50,amount:2})
  const estimate=plain(fast.itemQuantity('Half a core power vanilla',regular,207))
  assert.equal(estimate.kind,'estimated_mass');assert.equal(estimate.grams,207)
  assert.equal(plain(fast.itemQuantity('chicken breast',chicken,150)).kind,'estimated_mass')
  // A misread amount (200 lb for a 200 g estimate) goes to the agent.
  assert.equal(fast.itemQuantity('200 lb chicken',chicken,200),null)
  assert.deepEqual(plain(fast.itemQuantity('tbsp olive oil',oil,14)),{kind:'serving',servingId:20,amount:1})
  // The user's unit against a listing guess a third of it: the agent decides, not the guess.
  assert.equal(fast.itemQuantity('tbsp olive oil',oil,4),null)
})

test('the user words are found in the text in their own case',()=>{
  assert.equal(fast.verbatim('Coffee with 1 Cup fairlife milk','1 cup Fairlife milk'),'1 Cup fairlife milk')
  assert.equal(fast.verbatim('Banana','two bananas','banana'),'Banana')
  assert.equal(fast.verbatim('chiken brest','chicken breast'),null)
})

function evidenceWith(foods,history=[]){
  const discovered=[]
  return {discovered,
    async searchFoods(q){return {candidates:foods.filter(f=>q.toLowerCase().split(' ').some(w=>f.name.toLowerCase().includes(w)))
      .map(({id,name,brand})=>({id,name,brand}))}},
    async getFoodsAndServings(ids){return {foods:[...foods,regular].filter(f=>ids.includes(f.id))}},
    async recentFoods(){return history},
    discover(id){discovered.push(id)}}
}
function jev(answers){
  const tasks=[]
  return {tasks,select:async task=>{tasks.push(task);const a=answers.shift()
    return a?{status:'ok',model:'test',durationMs:1,promptTokens:0,completionTokens:0,...a}:{status:'unavailable'}}}
}
const input={originalText:'2 boiled eggs and 1 tbsp olive oil',consumedOn:'2026-09-30T12:00:00Z'}
const items=[{food:'boiled eggs',quote:'2 boiled eggs',detail:'',grams:100},{food:'olive oil',quote:'1 tbsp olive oil',detail:'',grams:14}]

test('confident picks become a plan with verbatim mentions and servings',async()=>{
  const {select,tasks}=jev([{choice:'food_5',confidence:0.97},{choice:'food_2',confidence:0.95}])
  const out=plain(await fast.textFastProposal(input,items,evidenceWith([egg,oil,chicken]),{select}))
  assert.deepEqual(out.proposal.components.map(c=>c.sourceText),['2 boiled eggs','1 tbsp olive oil'])
  assert.deepEqual(out.proposal.items.map(i=>[i.foodId,i.quantity.kind,i.quantity.amount]),[[5,'serving',2],[2,'serving',1]])
  assert.equal(tasks.length,2)
  assert.match(tasks[0].questions.selection.instructions,/Elite, Zero/)
})

test('the user history is offered, marked, and read once picked',async()=>{
  const text={originalText:'Vanilla corepower by fairlife',consumedOn:input.consumedOn}
  const history=[{id:13562,name:regular.name,brand:'Core Power'},{id:77,name:'Oat milk',brand:null}]
  const ev=evidenceWith([elite],history)
  const {select,tasks}=jev([{choice:'food_13562',confidence:0.6},{choice:'yes',confidence:0.92}])
  const out=plain(await fast.textFastProposal(text,[{food:'Vanilla corepower',quote:'Vanilla corepower',detail:'',grams:414}],ev,{select}))
  assert.equal(out.proposal.items[0].foodId,13562)
  const criteria=tasks[0].questions.selection.criteria
  assert.match(criteria.food_13562,/logged this before/)
  assert.equal(criteria.food_77,undefined)
  assert.equal(tasks[1].state.loggedBefore,true)
  assert.deepEqual(ev.discovered,[13562])
})

test('unsure, none, unreadable or doubled picks go to the agent',async()=>{
  const ev=evidenceWith([egg,oil])
  const reason=async(answers,list=items,text=input)=>(await fast.textFastProposal(text,list,ev,{select:jev(answers).select})).reason
  assert.equal(await reason([{choice:'food_5',confidence:0.95},{choice:'food_2',confidence:0.5},{choice:'no',confidence:0.9}]),'low_confidence')
  assert.equal(await reason([{choice:'food_5',confidence:0.95},{choice:'food_2',confidence:0.5},{choice:'yes',confidence:0.6}]),'low_confidence')
  assert.equal(await reason([{choice:'none',confidence:0.99},{choice:'food_2',confidence:0.95}]),'none_fits')
  assert.equal(await reason([],[{food:'chicken breast',quote:'chicken breast',detail:'',grams:150}]),'not_verbatim')
  assert.equal(await reason([{choice:'food_5',confidence:0.95},{choice:'food_5',confidence:0.95}]),'same_food_twice')
  assert.equal(await reason([]),'none_fits')
})

test('the flag is off, all, or a list of users',()=>{
  assert.equal(flag.fastRouteEnabledFor('off','u1'),false)
  assert.equal(flag.fastRouteEnabledFor('all','u1'),true)
  assert.equal(flag.fastRouteEnabledFor('u2, U1','u1'),true)
  assert.equal(flag.fastRouteEnabledFor('u2','u1'),false)
  assert.equal(flag.fastRouteEnabledFor('','u1'),false)
})

const bar=food(15304,'PRO Protein Bar, Chocolate Brownie',[['bar',70]],'PROBAR');bar.defaultServingWeightGram=100
const milk=food(15295,'Lala 100 Leche Ultrafiltrada',[['cup',250]],'Lala');milk.defaultServingWeightGram=250
const baguette=food(15297,'Baguette de Pollo');baguette.defaultServingWeightGram=100

test('a photo: a branded package is one labelled serving when the first look sees about one; plated food is its estimate',()=>{
  // The named 70 g bar, not the 100 g default.
  assert.deepEqual(plain(fast.photoQuantity(bar,70,'PROBAR bar')),{kind:'serving',servingId:153040,amount:1})
  // A whole carton (1000 g for a 250 g serving) or two bars: the agent decides how much was eaten.
  assert.equal(fast.photoQuantity(milk,1000,'Lala milk carton'),null)
  assert.equal(fast.photoQuantity(bar,140,'two bars'),null)
  const plated=plain(fast.photoQuantity(baguette,220,'Baguette de pollo'))
  assert.equal(plated.kind,'estimated_mass');assert.equal(plated.grams,220);assert.match(plated.basis,/photo/)
  assert.equal(fast.photoQuantity(baguette,null,'x'),null)
})

test('a photo meal routes only a single matched component; its mention is the photo component',async()=>{
  const ev=evidenceWith([bar,baguette])
  const input={consumedOn:'2026-09-30T12:00:00Z'}
  const ok=plain(await fast.photoFastProposal(input,[{food:'Baguette de pollo',detail:'',grams:220}],ev,{select:jev([{choice:'food_15297',confidence:0.93}]).select}))
  assert.deepEqual(ok.proposal.components.map(c=>c.sourceText),['photo: Baguette de pollo'])
  assert.deepEqual(ok.proposal.items.map(i=>i.quantity.kind),['estimated_mass'])
  const unsure=await fast.photoFastProposal(input,[{food:'Baguette de pollo',detail:'',grams:220}],ev,{select:jev([{choice:'none',confidence:0.8}]).select})
  assert.equal(unsure.reason,'none_fits')
  // A second component (a banana behind the cereal box?) leaves the meal to the agent, which sees the photo.
  const two=[{food:'Cheerios Protein',detail:'',grams:37},{food:'banana',detail:'',grams:118}]
  assert.equal((await fast.photoFastProposal(input,two,ev,{select:jev([]).select})).reason,'too_many_items')
})

test('a scanned package logs its label serving, not the 100 g per-100 g default',()=>{
  const hummus=food(14625,'Sabra Hummus',[['tbsp',28,2]],'Sabra');hummus.defaultServingWeightGram=100
  assert.deepEqual(plain(fast.labelledServing(hummus)),{kind:'serving',servingId:146250,amount:2})
  const drink=food(15296,'Tropical Punch Greek Yogurt Drink',[['bottle',207]],'Chobani');drink.defaultServingWeightGram=207
  assert.deepEqual(plain(fast.labelledServing(drink)),{kind:'serving',servingId:152960,amount:1})
  const loose=food(20,'Loose product',[],'Brand');loose.defaultServingWeightGram=100
  assert.deepEqual(plain(fast.labelledServing(loose)),{kind:'mass',grams:100})
  const other=food(21,'Snack',[['bag',30]],'Brand');other.defaultServingWeightGram=45
  assert.deepEqual(plain(fast.labelledServing(other)),{kind:'mass',grams:45})
})

test('a branded food logged once does not stand for a plain item; a named brand or a habit does (meal 30449)',async()=>{
  const generic=food(1897,'avocado oil',[['tsp',4.5]]),chosen=food(12023,'Avocado Oil',[['Tbsp',14]],'Chosen Foods')
  const tsp={originalText:'1tsp avocado oil',consumedOn:input.consumedOn}
  const run=async(text,logs)=>{
    const history=[{id:12023,name:'Avocado Oil',brand:'Chosen Foods',logs}]
    const {select,tasks}=jev([{choice:'food_1897',confidence:0.95}])
    await fast.textFastProposal(text,[{food:'avocado oil',quote:text.originalText,detail:'',grams:4.5}],evidenceWith([generic,chosen],history),{select})
    return tasks[0].questions.selection
  }
  const once=await run(tsp,1)
  assert.doesNotMatch(once.criteria.food_12023,/logged this before/)
  assert.match(once.instructions,/names no brand, the item is the generic food/)
  assert.match((await run(tsp,3)).criteria.food_12023,/logged this before/)
  assert.match((await run({originalText:'1tsp chosen foods avocado oil',consumedOn:input.consumedOn},1)).criteria.food_12023,/logged this before/)
})

test('unbranded history always fits; a brand fits when named without spaces',()=>{
  assert.equal(fast.historyFits({id:1,name:'Oat milk',brand:null,logs:1},'oat milk'),true)
  assert.equal(fast.historyFits({id:2,name:'Avocado Oil',brand:'Chosen Foods',logs:2},'avocado oil'),false)
  assert.equal(fast.historyFits({id:3,name:'Milk Shake',brand:'Core Power'},'Vanilla corepower'),true)
})
