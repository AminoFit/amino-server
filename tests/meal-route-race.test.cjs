const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {firstRoute}=require('../src/mealResolution/resolve.ts');

const later=(ms,value)=>new Promise(resolve=>setTimeout(()=>resolve(value),ms));
const failLater=(ms,message)=>new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms));
const never=()=>new Promise(()=>{});

test('a checked fast-route plan wins when it is ready first',async()=>{
  assert.deepEqual(await firstRoute(later(5,'fast plan'),later(50,'agent plan')),{result:'fast plan',fast:true});
});

test('the agent wins when it answers first, without waiting for the fast route',async()=>{
  assert.deepEqual(await firstRoute(never(),later(5,'agent plan')),{result:'agent plan',fast:false});
});

test('an inapplicable fast route leaves the meal to the agent',async()=>{
  assert.deepEqual(await firstRoute(later(1,null),later(20,'agent plan')),{result:'agent plan',fast:false});
});

test('the agent failing first does not end a meal whose fast route is still working',async()=>{
  const agent=failLater(1,'agent_failed');agent.catch(()=>{});
  assert.deepEqual(await firstRoute(later(50,'fast plan'),agent),{result:'fast plan',fast:true});
});

test('when neither route has a plan, the agent failure is the meal failure',async()=>{
  const agent=failLater(1,'agent_failed');agent.catch(()=>{});
  await assert.rejects(firstRoute(later(20,null),agent),/agent_failed/);
});
