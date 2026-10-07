const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')

// Who can see a food lives in two places only: public.food_visible (SQL) and src/userFoods/visibility.ts (server
// reads). A new inline copy of "catalogue or mine" would miss foods shared with the user, or show foods they lost.
const root=path.join(__dirname,'..')
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name)
  return entry.isDirectory()?files(full):[full]})

test('server code reads foods through the visibility helper',()=>{
  const inline=/privateToUserId\.is\.null,privateToUserId\.eq\./
  const offenders=files(path.join(root,'src')).filter(file=>/\.(ts|tsx)$/.test(file)&&!file.endsWith(path.join('userFoods','visibility.ts')))
    .filter(file=>inline.test(fs.readFileSync(file,'utf8'))).map(file=>path.relative(root,file))
  assert.deepEqual(offenders,[],'use visibleFoodFilter / canSeeFood from src/userFoods/visibility.ts')
})

test('migrations after the visibility rule call food_visible',()=>{
  const dir=path.join(root,'supabase/migrations')
  const inline=/"privateToUserId"\s+IS\s+NULL\s+OR\s+\w+\."privateToUserId"\s*=\s*p_user_id/i
  const offenders=fs.readdirSync(dir).filter(file=>file>'20261015000000').filter(file=>inline.test(fs.readFileSync(path.join(dir,file),'utf8')))
  assert.deepEqual(offenders,[],'use public.food_visible(p_user_id, f."privateToUserId", f."lineageId")')
})
