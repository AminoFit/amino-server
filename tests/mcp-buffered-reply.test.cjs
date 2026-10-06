require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMcpHandler}=require('mcp-handler');
const {bufferedReply,repliesInEventStream,streamsUntilClosed}=require('../src/mcp/bufferedReply');

const big='x'.repeat(14_000);
const mcp=createMcpHandler(server=>{
  server.registerTool('search_foods',{description:'test',inputSchema:{}},async()=>({content:[{type:'text',text:big}]}));
},{serverInfo:{name:'test',version:'1'}});

const post=body=>new Request('http://localhost/api/mcp',{method:'POST',body:JSON.stringify(body),headers:{
  'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'}});

test('a large tools/call reply streams from the SDK and goes out whole, as JSON with a length',async()=>{
  const body={jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'search_foods',arguments:{}}};
  const streamed=await mcp(post(body));
  assert.match(streamed.headers.get('content-type'),/text\/event-stream/);
  const reply=await bufferedReply(streamed,{batch:false,label:'test'});
  assert.equal(reply.status,200);
  assert.equal(reply.headers.get('content-type'),'application/json');
  const text=await reply.text();
  assert.equal(reply.headers.get('content-length'),String(Buffer.byteLength(text)));
  const message=JSON.parse(text);
  assert.equal(message.id,7);
  assert.equal(message.result.content[0].text,big);
});

test('initialize also comes back as JSON',async()=>{
  const reply=await bufferedReply(await mcp(post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',
    capabilities:{},clientInfo:{name:'t',version:'1'}}})),{batch:false,label:'test'});
  assert.equal(JSON.parse(await reply.text()).result.serverInfo.name,'test');
});

test('event streams yield their replies and skip notifications, keepalives and cut-off events',()=>{
  const stream=': keepalive\n\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n'+
    'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{}}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":4,"res';
  assert.deepEqual(repliesInEventStream(stream),[{jsonrpc:'2.0',id:3,result:{}}]);
});

test('a stream with no reply becomes a JSON-RPC error, not an empty 200',async()=>{
  const cut=new Response('event: message\ndata: {"jsonrpc":"2.0","id":4,"res',{headers:{'content-type':'text/event-stream'}});
  const reply=await bufferedReply(cut,{batch:false,label:'test'});
  assert.equal(reply.status,500);
  assert.equal(JSON.parse(await reply.text()).error.code,-32603);
});

test('only subscriptions/listen keeps streaming',()=>{
  assert.equal(streamsUntilClosed({method:'subscriptions/listen'}),true);
  assert.equal(streamsUntilClosed([{method:'tools/call'},{method:'subscriptions/listen'}]),true);
  assert.equal(streamsUntilClosed({method:'tools/call'}),false);
});
