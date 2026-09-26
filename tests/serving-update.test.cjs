const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function load(sourcePath, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', sourcePath), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => stubs[name] ?? {},
    Response, Request, console: { error() {}, log() {} }, Date, Number, Object, Set
  })
  return module.exports
}

const validator = load('app/api/protected/user/update-logged-food-item-serving/validateServingUpdate.ts')
const routePath = 'app/api/protected/user/update-logged-food-item-serving/route.ts'

test('serving auth verifies the access token without fetching the full profile', async () => {
  let verified = 0
  const api = load('utils/supabase/GetUserIdFromRequest.ts', {
    'next/headers': { cookies: () => ({ get: () => ({ value: 'valid-token' }) }) },
    './serverAdmin': { createAdminSupabase: () => ({
      auth: { getUser: async token => { verified++; assert.equal(token, 'valid-token'); return { data: { user: { id: 'owner' } }, error: null } } },
      from() { throw new Error('profile lookup is unnecessary for owned food') }
    }) }
  })
  assert.equal((await api.GetUserIdOnRequest()).userId, 'owner')
  assert.equal(verified, 1)
})

function fixture({ userId = 'owner', status = 'RESOLVED', servingFoodId = 9,
  beforeWrite = () => {} } = {}) {
  const state = {
    row: { id: 1, userId, messageId: 2, status: 'Processed', deletedAt: null,
      updatedAt: '2026-09-24T10:00:00', grams: 100, foodItemId: 9, kcal: 200,
      Message: { userId, status, deletedAt: null } },
    food: { id: 9, userId: null, defaultServingWeightGram: 100, kcalPerServing: 200, Nutrient: [] },
    serving: { id: 4, foodItemId: servingFoodId, servingName: 'cup' },
    writes: 0, reads: 0
  }
  state.food.Serving = [state.serving]
  state.row.FoodItem = state.food
  const db = { from(table) {
    const predicates = []; let update
    const query = {
      select() { return query },
      update(value) { update = value; return query },
      eq(key, value) { predicates.push([key, value]); return query },
      is(key, value) { predicates.push([key, value]); return query },
      async maybeSingle() {
        if (update) beforeWrite(state)
        state.reads++
        const row = table === 'LoggedFoodItem' ? state.row : table === 'FoodItem' ? state.food : state.serving
        if (!predicates.every(([key, value]) => row[key] === value)) return { data: null, error: null }
        if (update) { Object.assign(row, update); state.writes++; row.updatedAt = '2026-09-24T10:00:01' }
        return { data: { ...row }, error: null }
      }
    }
    return query
  }}
  const api = load(routePath, {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/utils/supabase/GetUserIdFromRequest': { GetUserIdOnRequest: async () => ({ userId: 'owner' }) },
    '@/utils/supabase/serverAdmin': { createAdminSupabase: () => db },
    '@/foodMessageProcessing/common/calculateNutrientData': {
      calculateNutrientData: grams => ({ kcal: grams * 2 })
    },
    './validateServingUpdate': validator
  })
  async function post(updateData, loggedFoodItemId = 1) {
    const request = new Request('https://example.test', { method: 'POST',
      body: JSON.stringify({ loggedFoodItemId, updateData }) })
    return api.POST(request)
  }
  return { state, post }
}

test('serving route refuses unauthorized food even through service-role client', async () => {
  const { state, post } = fixture({ userId: 'someone-else' })
  const response = await post({ grams: 50 })
  assert.equal(response.status, 404)
  assert.equal(state.writes, 0)
})

test('serving route rejects extra mutation fields before reading or writing', async () => {
  const { state, post } = fixture()
  for (const updateData of [{ grams: 50, userId: 'attacker' },
    { grams: Number.POSITIVE_INFINITY }, { grams: -1 }, { grams: 50, status: 'Processed' }]) {
    const response = await post(updateData)
    assert.equal(response.status, 422)
  }
  assert.equal(state.reads, 0)
  assert.equal(state.writes, 0)
})

test('serving route refuses a meal still being processed', async () => {
  const { state, post } = fixture({ status: 'PROCESSING' })
  const response = await post({ grams: 50 })
  assert.equal(response.status, 409)
  assert.equal(state.writes, 0)
})

test('serving route rejects a serving for a different food', async () => {
  const { state, post } = fixture({ servingFoodId: 10 })
  const response = await post({ grams: 50, servingId: 4, servingAmount: 1, loggedUnit: 'cup' })
  assert.equal(response.status, 422)
  assert.equal(state.writes, 0)
})

test('serving route updates owned food and computes nutrition from validated grams', async () => {
  const { state, post } = fixture()
  const response = await post({ grams: 50, servingId: 4, servingAmount: 1, loggedUnit: 'cup' })
  assert.equal(response.status, 200)
  assert.equal(state.row.grams, 50)
  assert.equal(state.row.kcal, 100)
  assert.equal(state.writes, 1)
  assert.equal(state.reads, 2, 'the existing food, nutrients and serving should arrive in one read')
})

test('serving route detects an intervening write before its own update', async () => {
  const { state, post } = fixture({ beforeWrite(s) { s.row.updatedAt = '2026-09-24T10:00:01' } })
  const response = await post({ grams: 50 })
  assert.equal(response.status, 409)
  assert.equal(state.writes, 0)
})

test('uncatalogued food cannot scale nutrition from a zero original portion', async () => {
  const { state, post } = fixture()
  state.row.foodItemId = null
  state.row.FoodItem = null
  state.row.grams = 0
  const response = await post({ grams: 50 })
  assert.equal(response.status, 422)
  assert.equal(state.writes, 0)
})

