require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mealTitle,mealSubline,agentNote,biggestFoods}=require('../src/app/dashboard/_lib/meal.ts');
const {MACROS,amountText}=require('../src/app/dashboard/_lib/stats.ts');
const {smoothedSeries,runs,signedWeight,shownWeight}=require('../src/app/dashboard/_lib/weight.ts');

const food=(id,name,kcal,extra={})=>({id,name,kcal,proteinG:0,carbG:0,totalFatG:0,fiberG:0,...extra});
const meal=extra=>({id:1,time:'12:00',input:'text',status:'logged',items:[],...extra});

test('macros run calories, protein, carbs, fat, as in the app',()=>{
  assert.deepEqual(MACROS.map(m=>m.key),['kcal','proteinG','carbG','totalFatG']);
});

test('a meal is titled by its two biggest foods and how many more',()=>{
  const items=[food(1,'greek yogurt',120),food(2,'granola',300),food(3,'blueberries',40),food(4,'honey',60)];
  assert.equal(mealTitle(items),'Granola, Greek Yogurt +2');
  assert.equal(mealTitle(items.slice(0,2)),'Granola, Greek Yogurt');
  assert.deepEqual(biggestFoods(items,4).map(item=>item.id),[2,1,4,3]);
});

test('the subline says who logged a meal, else the words, never an Add Food list',()=>{
  assert.deepEqual(mealSubline(meal({agent:'ChatGPT',text:'Estimated from the photo'})),{kind:'loggedBy',text:'Logged by ChatGPT'});
  assert.deepEqual(mealSubline(meal({loggedBy:'Sam',agent:'Claude'})),{kind:'loggedBy',text:'Logged by Sam via Claude'});
  assert.equal(mealSubline(meal({listsFoods:true,text:'Banana (1 large)'})),null);
  assert.deepEqual(mealSubline(meal({text:'two eggs [barcode:0123456789012] and toast'})),{kind:'said',text:'two eggs and toast'});
  assert.equal(agentNote(meal({agent:'ChatGPT',text:'Estimated from the photo'})),'Estimated from the photo');
  assert.equal(agentNote(meal({text:'two eggs'})),null);
});

test('amounts read as in the app: the serving, then its weight',()=>{
  assert.equal(amountText(food(1,'x',0,{unit:'g',amount:150,grams:150})),'150 g');
  assert.equal(amountText(food(1,'x',0,{unit:'bottle',amount:2,grams:660})),'2 Bottle · 660 g');
  assert.equal(amountText(food(1,'x',0,{unit:'240 ml',amount:2,grams:480})),'2 × 240 mL · 480 g');
});

test('expenditure is drawn as the 7-day average of the daily estimates, with gaps kept',()=>{
  const points=['2026-10-01','2026-10-02','2026-10-03','2026-10-10'].map((day,i)=>({day,kcalPerDay:2000+100*i,plusMinus:200}));
  const shown=smoothedSeries(points);
  assert.deepEqual(shown.map(p=>Math.round(p.kcal)),[2000,2050,2100,2300]);
  assert.deepEqual(runs(shown).map(run=>run.length),[3,1]);
});

test('weights follow the user\'s unit',()=>{
  assert.equal(shownWeight(80,'METRIC'),'80');
  assert.equal(shownWeight(80,'IMPERIAL'),'176.4');
  assert.equal(signedWeight(-1.25,'METRIC'),'−1.3');
});
