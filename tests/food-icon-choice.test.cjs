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
  },AbortSignal,console})
  return module.exports
}

const icons=load('app/api/queues/generate-food-icon/chooseFoodIcon.ts',{'@/ai/jev':{}})
const mushrooms={name:'Mixed Mushrooms',brand:'Wegmans'}
const candidates=[
  {id:13356,description:'mixed vegetables',similarity:0.838},
  {id:13392,description:'mushrooms',similarity:0.828},
  {id:9,description:'lasagna',similarity:0.55}
]
// A fake Jev: answers the choice and the confirmation from the given replies, recording each task.
function jev(choose,confirm){
  const tasks=[]
  const select=async task=>{
    tasks.push(task)
    const reply='yes' in task.options?confirm:choose
    return reply?{status:'ok',model:'test',durationMs:1,promptTokens:0,completionTokens:0,...reply}
      :{status:'unavailable',model:'test',durationMs:1,promptTokens:0,completionTokens:0}
  }
  return {select,tasks}
}

test('shortlist leaves out icons that are never the same food, closest first',async()=>{
  const {select,tasks}=jev({choice:'none',confidence:0.95})
  await icons.chooseFoodIcon(mushrooms,[...candidates].reverse(),{select})
  assert.deepEqual(Object.keys(tasks[0].options),['none','icon_13356','icon_13392'])
  assert.equal(tasks[0].state.foodName,'Mixed Mushrooms')
})

test('a confident pick reuses that icon without a confirmation',async()=>{
  const {select,tasks}=jev({choice:'icon_13392',confidence:0.93})
  const choice=await icons.chooseFoodIcon(mushrooms,candidates,{select})
  assert.deepEqual({...choice},{kind:'reuse',imageId:13392,similarity:0.828,confidence:0.93})
  assert.equal(tasks.length,1)
})

test('an unsure pick (several fitting icons) is confirmed on its own',async()=>{
  const confirmed=jev({choice:'icon_13392',confidence:0.45},{choice:'yes',confidence:0.99})
  assert.equal((await icons.chooseFoodIcon(mushrooms,candidates,{select:confirmed.select})).kind,'reuse')
  assert.equal(confirmed.tasks[1].state.iconDrawnFor,'mushrooms')
  const weakYes=jev({choice:'icon_13356',confidence:0.5},{choice:'yes',confidence:0.31})
  assert.deepEqual({...await icons.chooseFoodIcon(mushrooms,candidates,{select:weakYes.select})},
    {kind:'generate',reason:'low_confidence'})
  const no=jev({choice:'icon_13356',confidence:0.5},{choice:'no',confidence:0.9})
  assert.equal((await icons.chooseFoodIcon(mushrooms,candidates,{select:no.select})).kind,'generate')
})

test('none, an unknown option or no close candidates draw a new icon',async()=>{
  assert.deepEqual({...await icons.chooseFoodIcon(mushrooms,candidates,{select:jev({choice:'none',confidence:1}).select})},
    {kind:'generate',reason:'none_fits'})
  assert.equal((await icons.chooseFoodIcon(mushrooms,candidates,{select:jev({choice:'icon_1',confidence:1}).select})).kind,'generate')
  const {select,tasks}=jev({choice:'none',confidence:1})
  assert.deepEqual({...await icons.chooseFoodIcon(mushrooms,[candidates[2]],{select})},{kind:'generate',reason:'no_candidates'})
  assert.equal(tasks.length,0)
})

test('without Jev only a very close name is reused',async()=>{
  const down=jev(null)
  assert.deepEqual({...await icons.chooseFoodIcon(mushrooms,candidates,{select:down.select})},
    {kind:'generate',reason:'jev_unavailable'})
  const tortillas=[{id:13551,description:'Super Soft Flour Tortillas',similarity:0.9}]
  assert.deepEqual({...await icons.chooseFoodIcon({name:'Flour Tortillas'},tortillas,{select:down.select})},
    {kind:'reuse',imageId:13551,similarity:0.9,confidence:null})
})

test('a "none" with a strong name match gets the yes/no look; the serving unit goes to Jev',async()=>{
  const milk={name:'1% Lowfat Milk',servingUnit:'cup'}
  const asked=[]
  const select=async task=>{asked.push(task);return task.options.yes?{status:'ok',choice:'yes',confidence:0.99}:{status:'ok',choice:'none',confidence:0.8}}
  const close=await icons.chooseFoodIcon(milk,[{id:7,description:'2% Reduced Fat Milk',similarity:0.9}],{select})
  assert.equal(close.kind,'reuse')
  assert.equal(close.imageId,7)
  assert.equal(asked[0].state.servingUnit,'cup')
  assert.equal(asked[1].state.iconDrawnFor,'2% Reduced Fat Milk')
  const far=await icons.chooseFoodIcon(milk,[{id:8,description:'Oat milk',similarity:0.7}],{select})
  assert.equal(far.kind,'generate','a weaker match after "none" is drawn without a second look')
  assert.equal(far.reason,'none_fits')
  assert.equal(asked.length,3,'no second look was asked for it')
  const no=await icons.chooseFoodIcon(milk,[{id:7,description:'2% Reduced Fat Milk',similarity:0.9}],
    {select:async task=>task.options.yes?{status:'ok',choice:'no',confidence:0.9}:{status:'ok',choice:'none',confidence:0.8}})
  assert.equal(no.kind,'generate')
  assert.equal(no.reason,'none_fits')
})
