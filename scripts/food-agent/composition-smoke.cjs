// Explicit opt-in; synthetic examples only, no database reads or writes.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..');
if(!process.argv.includes('--live'))throw Error('Use --live to send these synthetic cases to the configured extraction model');
const env=require(root+'/node_modules/dotenv').parse(fs.readFileSync(root+'/.env.prod'));
require(root+'/node_modules/ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',target:'ES2020'}});
const {logFoodItemPrompts}=require(root+'/src/foodMessageProcessing/logFoodItemExtract/logFoodItemPrompts.ts');
const {preserveExplicitAdditions}=require(root+'/src/foodResolution/composition.ts');
const {default:OpenAI}=require(root+'/node_modules/openai');
const client=new OpenAI({apiKey:env.OPENAI_API_KEY,maxRetries:0,timeout:30000});
const config=logFoodItemPrompts['gpt-4o-mini'];
const cases=[{text:'Coffee with fairlife milk cup',count:2,brand:'Fairlife',amount:/cup/},{text:'One cup of coffee with 2 tbsp Fairlife 2% milk',count:2,brand:'Fairlife',amount:/2\s*(?:tbsp|tablespoons?)/i},{text:'Toast with 10 g Kerrygold butter',count:2,brand:'Kerrygold',amount:/10\s*g/i},{text:'Starbucks 2% milk latte',count:1,brand:'Starbucks'}];
(async()=>{
 const results=[];
 for(const c of cases){
  const start=performance.now();const response=await client.chat.completions.create({model:'gpt-4o-mini',temperature:.002,max_tokens:8192,
    messages:[{role:'system',content:config.systemPrompt},{role:'user',content:config.prompt.replace('INPUT_HERE',c.text)}],
    response_format:config.response_schema?{type:'json_schema',json_schema:config.response_schema}:{type:'json_object'}});
  const data=JSON.parse(response.choices[0].message.content);const items=preserveExplicitAdditions(data.food_items.map(i=>({food_database_search_name:i.full_single_food_database_search_name,full_item_user_message_including_serving:i.full_single_item_user_message_including_serving_or_quantity,branded:i.branded,brand:i.brand,nutritional_information:i.nutritional_information})));
  const branded=items.filter(i=>i.brand?.toLowerCase()===c.brand.toLowerCase());
  const passed=items.length===c.count&&branded.length===1&&(c.count!==2||(!items[0].branded&&(!c.amount||c.amount.test(branded[0].full_item_user_message_including_serving))))&&(!c.text.includes('milk cup')||(!/%|fat.free|whole milk/i.test(branded[0].food_database_search_name)&&!(/cup/i.test(items.find(i=>!i.branded).full_item_user_message_including_serving))));
  const row={text:c.text,passed,durationMs:performance.now()-start,items};results.push(row);console.log(JSON.stringify(row));
 }
 const output=path.join(__dirname,'results',new Date().toISOString().replace(/[:.]/g,'-')+'-composition.json');fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify({output}));if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error('Extraction check failed:',e.status??e.name);process.exitCode=1});
