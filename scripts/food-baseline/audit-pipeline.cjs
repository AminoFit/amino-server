/* Offline characterization of pipeline defects, not acceptance tests for desired behavior.
 * Usage: node scripts/food-baseline/audit-pipeline.cjs [server-source-root]
 * Real TypeScript functions run with database/provider boundaries stubbed. No network or writes.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const observations = [];
const record = (caseName, actual) => observations.push({case: caseName, actual});
const unexpected = () => { throw new Error('Unexpected external dependency in offline audit'); };
let database;
const cache = new Map();
const stubs = {
  '@/utils/supabase/serverAdmin': {createAdminSupabase: () => database || unexpected()},
  '@/foodResolution/model': {FOOD_REASONING_MODEL: 'offline', foodCompletion: unexpected},
  '@/languageModelProviders/openai/customFunctions/chatCompletion': {chatCompletion: unexpected},
  '@/foodMessageProcessing/common/debugHelper': {getUserByEmail: unexpected},
  '@/ai/jev': {selectWithJev: unexpected},
  '../userId/accountScope': {accountScope: () => ({assertCurrent() {}})},
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports: {}};
  cache.set(file, module);
  let source = fs.readFileSync(file, 'utf8');
  // Expose the internal conversion for a focused probe, without editing production code.
  if (file.endsWith('/getServingSizeFromFoodItem.ts')) source += '\nexport { convertToServing };';
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  function localRequire(name) {
    if (name in stubs) return stubs[name];
    if (name.endsWith('/telemetry') || name === '../telemetry') return {
      currentFoodConfig: () => ({features: {fast_selector: 'on', agent_fallback: 'on'}}), foodMetric: () => {}};
    if (name === '../common/debugHelper') return {getUserByEmail: unexpected};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(resolved.endsWith('.ts') ? resolved : resolved + '.ts');
    }
    if (['moment-timezone', 'mathjs', 'zod'].includes(name)) return require(name);
    throw new Error(`Unstubbed import: ${name} in ${file}`);
  }
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {
    console, performance, AbortController, AbortSignal, setTimeout, clearTimeout, process: {env: {}}
  }, {filename: file})(localRequire, module, module.exports);
  return module.exports;
}
const read = name => load(path.join(root, 'src', name));
const item = (text, name = 'rice') => ({food_database_search_name: name,
  full_item_user_message_including_serving: text, branded: false});
async function main() {
  const history = read('foodResolution/history/reuse.ts');
  for (const text of ['same smoothie as yesterday', 'same smoothie as yesterday without honey',
    'le même smoothie qu’hier', 'el mismo batido de ayer', '和昨天一样的奶昔', 'my usual breakfast']) {
    record(text, {interceptedBeforeAgent: history.isHistoryReference(text), target: history.referenceTarget(text)});
  }
  assert.equal(history.referenceTarget('same smoothie as yesterday without honey'), null);
  assert.equal(history.isHistoryReference('le même smoothie qu’hier'), false);
  const {validateProposal} = read('foodResolution/agent/validate.ts');
  const food = {id: 1, name: 'rice', brand: null, weightUnknown: false, defaultServingWeightGram: 100,
    kcalPerServing: 130, proteinPerServing: 2.5, carbPerServing: 28, totalFatPerServing: 0.3,
    Serving: [{id: 11, foodItemId: 1, servingName: 'cup', servingWeightGram: 158, defaultServingAmount: 1}]};
  for (const text of ['two cups rice', 'deux tasses de riz', 'dos tazas de arroz', '半杯米饭',
    '1/2 cup rice', 'half a cup rice', 'one cup regular rice']) {
    const result = validateProposal({decision: 'match', foodId: 1, servingId: 11}, item(text), new Map([[1, food]]));
    record(text, {agentAccepted: !!result, grams: result?.grams ?? null});
  }
  const bowl = {...food, Serving: [{...food.Serving[0], servingName: 'bowl'}]};
  const bowlResult = validateProposal({decision: 'match', foodId: 1, servingId: 11}, item('one bowl rice'), new Map([[1, bowl]]));
  assert.equal(bowlResult, null);
  record('one bowl rice, with authoritative bowl weight available', {agentAccepted: !!bowlResult});
  const composition = read('foodResolution/composition.ts');
  for (const [text, name] of [['chicken with butter', 'chicken'], ['poulet avec du beurre', 'poulet']]) {
    record(text, {rewrittenItems: composition.preserveExplicitAdditions([item(text, name)]).map(x => x.food_database_search_name),
      vetoPlainBase: composition.missingExplicitAdditions(item(text, name), name)});
  }
  const {convertToServing} = read('foodMessageProcessing/getServingSizeFromFoodItem/getServingSizeFromFoodItem.ts');
  const servingFood = {...food, Serving: [
    {id: 101, servingName: 'tsp', servingWeightGram: 5, defaultServingAmount: 1},
    {id: 102, servingName: 'cup', servingWeightGram: 100, defaultServingAmount: 1}]};
  const converted = convertToServing(JSON.stringify({equation_grams: '100', amount: 1, serving_name: 'cup',
    full_serving_string: '1 cup', matching_serving_id: 2}), {1: 101, 2: 102}, servingFood, item('one cup rice'));
  assert.equal(converted.serving.serving_id, 101);
  record('model selects 1 cup; converter changes serving ID to teaspoon', converted.serving);
  const invalidId = convertToServing(JSON.stringify({equation_grams: '37', amount: 1, serving_name: 'piece',
    full_serving_string: '1 piece', matching_serving_id: 99999}), {1: 101, 2: 102}, servingFood, item('one piece rice'));
  assert.equal(invalidId.serving.serving_id, 99999);
  record('model returns unknown serving ID', invalidId.serving);
  database = {from: () => ({select() {return this}, ilike() {return this}, limit: async () => ({data: [food], error: null})})};
  const exact = await read('foodMessageProcessing/findExactLocalFood.ts').findExactLocalFood(item('100 g cooked rice', 'rice'));
  assert.equal(exact.id, 1);
  record('shortened extraction searchName rice; description cooked rice; catalogue rice', {exactShortcutAccepted: !!exact});
  const milk = {...food, name: '2% milk'};
  const milkItem = item('100 g 2% milk', '2% milk');
  const resolution = validateProposal({decision: 'match', foodId: 1, servingId: null}, milkItem, new Map([[1, milk]]));
  assert.ok(resolution);
  const live = await read('foodResolution/agent/live.ts').tryFoodAgentLive({item: milkItem}, {
    run: async () => ({status: 'matched', resolution}), read: async () => milk});
  assert.equal(live, null);
  record('100 g 2% milk validates, then live serving reconstruction rejects it', {proposalAccepted: !!resolution, liveAccepted: !!live});
  const constraints = read('foodResolution/constraints/contract.ts');
  for (const text of ['20 g protein', '20 g de protéines', '20 g de proteína', '20克蛋白质']) {
    record(text, {shadowNutritionRecognized: constraints.hasNutritionStatement(text)});
  }
  database = {rpc: async () => ({data: null, error: {message: 'Database unavailable'}})};
  stubs['@/utils/embeddingsCache/getCachedOrFetchEmbeddings'] = {getCachedOrFetchEmbeddings: unexpected};
  const matches = await read('foodMessageProcessing/getBestFoodEmbeddingMatches/getBestFoodEmbeddingMatches.ts').getBestFoodEmbeddingMatches(1, 2);
  assert.equal(matches.length, 0);
  record('all four embedding RPCs return errors', {searchReturnedNormally: true, matches: matches.length});
  const localMatcher = path.join(root, 'src/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDb.ts');
  if (fs.existsSync(localMatcher)) {
    const [selected] = await load(localMatcher).findBestFoodMatchtoLocalDb([{id: 7, name: '寿司', brand: null}], item('米饭', '米饭'), {});
    assert.equal(selected.id, 7);
    record('undeployed local matcher: Chinese rice request versus sushi candidate', {incorrectExactSelection: selected.name});
    const selectedExternal = await read('foodMessageProcessing/common/selectExternalFood.ts').findBestFoodMatchExternalDb({},
      item('米饭', '米饭'), [{foodName: '寿司', foodBrand: null}]);
    assert.equal(selectedExternal.foodName, '寿司');
    record('undeployed external matcher: Chinese rice request versus sushi candidate', {incorrectExactSelection: selectedExternal.foodName});
  }
  const mobileLock = path.resolve(root, '../amino-mobile/common/dbReadWrite/foodDataLock.ts');
  if (fs.existsSync(mobileLock)) {
    const {withFoodDataLock} = load(mobileLock);
    let release, started, syncApplied = false;
    const gate = new Promise(resolve => {release = resolve});
    const active = new Promise(resolve => {started = resolve});
    const edit = withFoodDataLock(async () => {started(); await gate});
    await active;
    const sync = withFoodDataLock(async () => {syncApplied = true});
    await Promise.resolve();
    assert.equal(syncApplied, false);
    record('mobile slow edit owns global food lock', {unrelatedSyncBlocked: !syncApplied});
    release(); await Promise.all([edit, sync]);
  }
  console.log(JSON.stringify({sourceRoot: root, nature: 'offline real-function characterization; no model/database calls', observations}, null, 2));
}
main().catch(error => {console.error(error); process.exitCode = 1});
