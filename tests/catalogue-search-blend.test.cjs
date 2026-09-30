const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')
const source=fs.readFileSync(path.join(__dirname,'..','src','mealResolution','searchBlend.ts'),'utf8')
const loaded={exports:{}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {module:loaded,exports:loaded.exports})
const {blendSearch,containsQuery}=loaded.exports
const row=(id,name,brand=null,knownAs=null)=>({id,name,brand,knownAs})

test('an exact text hit comes first, then nearest by meaning, then text hits containing every word',()=>{
  const text=[row(1,'Vanilla Core Power Elite High Protein Milk Shake','Fairlife'),row(2,'French Vanilla Coffee Creamer')]
  const near=[row(3,'Core Power, High Protein Milk Shake, Vanilla','Core Power'),row(1,'Vanilla Core Power Elite High Protein Milk Shake','Fairlife')]
  assert.deepEqual([...blendSearch('Vanilla core power by fairlife',text,near).map(r=>r.id)],[3,1,2])
  const apples=[row(10,'Apples','Bfruitful'),row(11,'green apples'),row(12,'Honey Crisp Apples','Meijer')]
  assert.deepEqual([...blendSearch('apples',apples,[row(6,'Apple'),row(11,'green apples')]).map(r=>r.id)],[10,6,11,12])
  assert.deepEqual([...blendSearch('oat milk',[row(20,'Oat Milk'),row(21,'Oat milk, chocolate')],[row(22,'Almond milk')]).map(r=>r.id)],[20,22,21])
})

test('plurals, brands and aliases count as the query words; weak text hits fall behind meaning',()=>{
  assert.equal(containsQuery('apples',row(6,'Apple')),true)
  assert.equal(containsQuery('sea salt rxbar',row(9,'Chocolate Sea Salt','RxBar')),true)
  assert.equal(containsQuery('toum',row(7,'Garlic Sauce',null,['toum'])),true)
  assert.equal(containsQuery('sea salt rxbar',row(8,'Sea Salt Roasted Cashews','Karma')),false)
  const text=[row(8,'Sea Salt Roasted Cashews','Karma')],near=[row(9,'Chocolate Sea Salt Protein Bar','Rxbar')]
  assert.deepEqual([...blendSearch('Sea salt rxbar',text,near).map(r=>r.id)],[9,8])
})

test('without meaning results the text search order is kept, and the list is capped',()=>{
  const text=Array.from({length:25},(_,i)=>row(i+1,`food ${i}`))
  assert.deepEqual([...blendSearch('zzz',text,[]).map(r=>r.id)],text.slice(0,20).map(r=>r.id))
  assert.equal(containsQuery('  ',row(1,'Apple')),false)
})
