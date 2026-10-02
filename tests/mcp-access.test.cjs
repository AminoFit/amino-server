require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {encodeCursor,decodeCursor,pageOf,daysBetween,McpInputError}=require('../src/mcp/meals');
const {goalPatch,goalNote,shapeProfile,birthDateOf,storedBirthDate,goalsOnDay,withDayGoals}=require('../src/mcp/profile');
const {oauthClaims}=require('../src/mcp/auth');
const {safeNextPath}=require('../src/app/login/nextPath');
const {isAuthorizationId}=require('../src/utils/supabase/oauthServer');

const jwt=claims=>['{"alg":"HS256"}',JSON.stringify(claims),'sig'].map((part,i)=>i<2?Buffer.from(part).toString('base64url'):part).join('.');

test('cursors round-trip the database position exactly and reject anything else',()=>{
  const cursor=encodeCursor('sync','2026-09-30 16:00:00.123456+00',42);
  assert.deepEqual(decodeCursor('sync',cursor),{position:'2026-09-30 16:00:00.123456+00',id:42});
  assert.equal(decodeCursor('sync',undefined),null);
  assert.throws(()=>decodeCursor('meals',cursor),McpInputError,'a sync cursor is not a list_meals cursor');
  assert.throws(()=>decodeCursor('sync','not-a-cursor'),McpInputError);
  assert.throws(()=>decodeCursor('sync',encodeCursor('sync',"2026-09-30'; drop table",1)),McpInputError);
});

test('a page drops the look-ahead row and points the cursor at its last meal',()=>{
  const rows=[1,2,3].map(id=>({position:`2026-09-30 1${id}:00:00`,id,meal:{id}}));
  const page=pageOf('meals',rows,2);
  assert.deepEqual(page.meals,[{id:1},{id:2}]);
  assert.equal(page.hasMore,true);
  assert.deepEqual(decodeCursor('meals',page.nextCursor),{position:'2026-09-30 12:00:00',id:2});
  assert.deepEqual(pageOf('meals',[],2),{meals:[],hasMore:false,nextCursor:undefined});
  assert.equal(daysBetween('2026-09-01','2026-09-30'),30);
  assert.equal(daysBetween('2024-01-01','2024-12-31'),366);
});

const row={tzIdentifier:'America/New_York',unitPreference:'IMPERIAL',calorieGoal:2000,proteinGoal:100,carbsGoal:250,fatGoal:67,
  manualMacroGoals:false,weightKg:'72.50',heightCm:'180.00',dateOfBirth:'1990-05-15T04:00:00',gender:'female',activityLevel:'Very Active'};

test('setting a macro keeps it exactly; changing only calories rescales macros that follow them',()=>{
  assert.deepEqual(goalPatch(row,{proteinG:150.4}),{proteinGoal:150,manualMacroGoals:true});
  assert.deepEqual(goalPatch(row,{calories:2500}),{calorieGoal:2500,proteinGoal:125,carbsGoal:313,fatGoal:84});
  assert.deepEqual(goalPatch({...row,manualMacroGoals:true},{calories:2500}),{calorieGoal:2500},
    'macros the user set by hand stay put');
  assert.deepEqual(goalPatch({...row,calorieGoal:null},{calories:1800}),{calorieGoal:1800});
  assert.equal(goalNote({calories:2000,proteinG:100,carbsG:250,fatG:67}),undefined);
  assert.match(goalNote({calories:2000,proteinG:200,carbsG:300,fatG:100}),/2900 kcal/);
});

test('the profile reads the birth date in the user\'s timezone, the way the app saved it',()=>{
  const profile=shapeProfile(row,new Date('2026-09-30T12:00:00Z'));
  assert.deepEqual(profile,{timezone:'America/New_York',units:'imperial',
    goals:{calories:2000,proteinG:100,carbsG:250,fatG:67,macrosSetByHand:false},
    body:{weightKg:72.5,heightCm:180,dateOfBirth:'1990-05-15',age:36,sex:'female',activityLevel:'Very Active'}});
  assert.equal(storedBirthDate('1990-05-15','America/New_York'),'1990-05-15T04:00:00.000Z');
  assert.equal(birthDateOf(storedBirthDate('1990-05-15','Asia/Tokyo'),'Asia/Tokyo'),'1990-05-15');
  assert.equal(shapeProfile({...row,tzIdentifier:'Nowhere/Else'}).timezone,'UTC');
});

test('only OAuth-issued tokens count as agent tokens',()=>{
  assert.deepEqual(oauthClaims(jwt({sub:'u1',client_id:'c1',exp:5,scope:'openid email'})),
    {sub:'u1',clientId:'c1',exp:5,scopes:['openid','email']});
  assert.equal(oauthClaims(jwt({sub:'u1',role:'authenticated'})),null,'the app\'s own session');
  assert.equal(oauthClaims('garbage'),null);
});

test('sign-in only returns to a path on this site; authorization ids are checked before use',()=>{
  assert.equal(safeNextPath('/oauth/consent?authorization_id=abc'),'/oauth/consent?authorization_id=abc');
  for(const bad of ['https://evil.example','//evil.example','/\\evil.example',null,42]) assert.equal(safeNextPath(bad),null);
  assert.equal(isAuthorizationId('a1b2c3d4-e5f6'),true);
  assert.equal(isAuthorizationId('../../user'),false);
});

test('the MCP handler lists every tool with its schema and refuses calls without a user',async()=>{
  const {createMcpHandler}=require('mcp-handler');
  const {registerAminoTools}=require('../src/mcp/tools');
  const handler=createMcpHandler(registerAminoTools,{serverInfo:{name:'amino',version:'test'}});
  const call=async(method,params,id)=>{
    const response=await handler(new Request('http://localhost/api/mcp',{method:'POST',
      headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},
      body:JSON.stringify({jsonrpc:'2.0',id,method,params})}));
    const text=await response.text();
    const json=text.startsWith('{')?text:text.split('\n').find(line=>line.startsWith('data:')).slice(5);
    return JSON.parse(json);
  };
  const listed=await call('tools/list',{},1);
  const tools=Object.fromEntries(listed.result.tools.map(tool=>[tool.name,tool]));
  assert.deepEqual(Object.keys(tools).sort(),['get_daily_summary','get_meals','get_my_food','get_profile','list_meals',
    'list_my_foods','sync_meals','update_body_stats','update_goals']);
  assert.equal(tools.list_my_foods.annotations.readOnlyHint,true);
  assert.deepEqual(tools.list_my_foods.inputSchema.properties.kind.enum,['recipes','foods','all']);
  assert.deepEqual(tools.get_my_food.inputSchema.required,['id']);
  assert.equal(tools.list_meals.annotations.readOnlyHint,true);
  assert.equal(tools.update_goals.annotations.readOnlyHint,false);
  assert.deepEqual(tools.list_meals.inputSchema.required,['from']);
  assert.deepEqual(tools.update_body_stats.inputSchema.properties.sex.enum,['male','female','other']);
  const refused=await call('tools/call',{name:'get_profile',arguments:{}},2);
  assert.equal(refused.result.isError,true);
  assert.match(refused.result.content[0].text,/Not signed in/);
});

test('tool calls run as the signed-in user, are logged, and write goals the way the app reads them',async()=>{
  const http=require('node:http');
  const seen=[];
  let user={tzIdentifier:'Europe/London',unitPreference:'METRIC',calorieGoal:2000,proteinGoal:100,carbsGoal:250,fatGoal:67,
    manualMacroGoals:false,weightKg:70,heightCm:175,dateOfBirth:'1990-05-14T23:00:00',gender:'male',activityLevel:'None'};
  const server=http.createServer((req,res)=>{
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const url=new URL(req.url,'http://x');
      seen.push({method:req.method,path:url.pathname,auth:req.headers.authorization,body:body?JSON.parse(body):null});
      const json=(value,status=200,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(value))};
      if(url.pathname==='/rest/v1/McpRequest'&&req.method==='HEAD') return json(null,200,{'content-range':'*/3'});
      if(url.pathname==='/rest/v1/McpRequest') return json(null,201);
      if(url.pathname==='/rest/v1/User'&&req.method==='PATCH'){user={...user,...JSON.parse(body)};return json(user)}
      if(url.pathname==='/rest/v1/User') return json(user);
      if(url.pathname==='/rest/v1/UserGoalHistory') return json([{effectiveOn:'2026-09-01',calorieGoal:2000,proteinGoal:100,
        carbsGoal:250,fatGoal:67}]);
      if(url.pathname==='/rest/v1/rpc/mcp_list_meals') return json([{eaten:'2026-09-30 12:00:00',id:7,meal:{id:7}},
        {eaten:'2026-09-30 13:00:00',id:8,meal:{id:8}}]);
      json({message:'unexpected'},404);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env};
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'});
  try {
    const {createMcpHandler}=require('mcp-handler');
    const {registerAminoTools}=require('../src/mcp/tools');
    const handler=createMcpHandler(registerAminoTools,{serverInfo:{name:'amino',version:'test'}});
    const call=async(name,args)=>{
      const request=new Request('http://localhost/api/mcp',{method:'POST',
        headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
      request.auth={token:'user-token',clientId:'claude',scopes:[],extra:{userId:'u1'}};
      const text=await (await handler(request)).text();
      return JSON.parse(text.startsWith('{')?text:text.split('\n').find(line=>line.startsWith('data:')).slice(5)).result;
    };
    const profile=await call('get_profile',{});
    assert.equal(profile.isError,undefined,JSON.stringify(profile));
    assert.equal(profile.structuredContent.body.dateOfBirth,'1990-05-15','a London birth date saved in summer time');
    assert.deepEqual(profile.structuredContent.goalHistory,[{from:'2026-09-01',calories:2000,proteinG:100,carbsG:250,fatG:67}]);
    assert.equal(seen.find(r=>r.path==='/rest/v1/UserGoalHistory').auth,'Bearer user-token','history is read as the user');
    assert.equal(seen.find(r=>r.path==='/rest/v1/User').auth,'Bearer user-token','reads use the agent\'s own token');
    assert.equal(seen.find(r=>r.path==='/rest/v1/McpRequest'&&r.method==='POST').body.clientId,'claude');

    const goals=await call('update_goals',{proteinG:300});
    assert.deepEqual(seen.find(r=>r.method==='PATCH').body,{proteinGoal:300,manualMacroGoals:true});
    assert.equal(goals.structuredContent.goals.proteinG,300);
    assert.match(goals.structuredContent.note,/2803 kcal/);

    const page=await call('list_meals',{from:'2026-09-30',limit:1});
    assert.deepEqual(page.structuredContent.meals,[{id:7}]);
    assert.equal(page.structuredContent.hasMore,true);
    assert.equal(seen.find(r=>r.path==='/rest/v1/rpc/mcp_list_meals').body.p_to,'2026-09-30','to defaults to from');

    const invalid=await call('update_goals',{});
    assert.equal(invalid.isError,true,'at least one goal is required');
    const tooLong=await call('get_daily_summary',{from:'2025-01-01',to:'2026-09-30'});
    assert.match(tooLong.content[0].text,/at most 366 days/);
  } finally {
    process.env=env;
    server.close();
  }
});

test('daily summaries judge each day against the goals it had', () => {
  const current={calories:2000,proteinG:150,carbsG:200,fatG:70};
  const history=[{from:'2026-09-01',calories:2500,proteinG:140,carbsG:250,fatG:80},
    {from:'2026-09-20',calories:2100,proteinG:null,carbsG:210,fatG:70}];
  assert.equal(goalsOnDay(history,'2026-09-10',current).calories,2500);
  assert.equal(goalsOnDay(history,'2026-09-20',current).calories,2100,'a change applies from its own day');
  assert.equal(goalsOnDay(history,'2026-09-20',current).proteinG,150,'an empty goal falls back to today\'s');
  assert.equal(goalsOnDay(history,'2026-08-01',current).calories,2500,'before history: the earliest known');
  assert.deepEqual(goalsOnDay([],'2026-09-10',current),current);
  const {days,goalChanges}=withDayGoals([{date:'2026-09-19',kcal:1800},{date:'2026-09-21',kcal:2000}],history,current,
    '2026-09-15','2026-09-30');
  assert.deepEqual(days.map(day=>day.goals.calories),[2500,2100]);
  assert.deepEqual(goalChanges.map(change=>change.from),['2026-09-20']);
});
