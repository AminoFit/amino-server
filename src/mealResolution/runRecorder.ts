import { AsyncLocalStorage } from "node:async_hooks"

/** A debug record of one meal-operation delivery (public."MealRun"): each tool call, each model call with its tokens
 * and cost, and each resolveMeal call's stage timeline. The worker opens a run; deep callers (tools, Jev, the first
 * and second looks, label reads, web searches) record into it without threading a dependency through. Outside a run
 * (evals, scripts, tests) every record call is a no-op, so behaviour there is unchanged. Recording is synchronous,
 * bounded and never throws: it must not change what the resolver does or how long it takes. */
export type RunTool={name:string;atMs:number;ms:number;input:unknown;output:unknown;error?:string}
export type RunModelCall={kind:string;model:string;atMs:number;ms:number;promptTokens:number;completionTokens:number;
  costUsd:number|null;status:string;detail?:string;output?:unknown}
export type RunResolution={model:string;validationErrorCode?:string;timeline:{stage:string;ms:number}[];trace:string[];
  steps:number;toolCalls:number;durationMs:number;error?:string}
export type MealRun={started:number;tools:RunTool[];models:RunModelCall[];resolutions:RunResolution[]}

const storage=new AsyncLocalStorage<MealRun>()
// A runaway loop cannot grow a run without bound; the worker stores fewer still.
const MAX_ENTRIES=200

/** Runs `work` inside a fresh run and returns the run with its value. Errors from `work` propagate unchanged. */
export async function withMealRun<T>(work:()=>Promise<T>):Promise<{value:T;run:MealRun}> {
  const run:MealRun={started:performance.now(),tools:[],models:[],resolutions:[]}
  const value=await storage.run(run,work)
  return {value,run}
}

export const currentMealRun=():MealRun|undefined=>storage.getStore()

const since=(run:MealRun,startedAt:number,endedAt=performance.now())=>({atMs:Math.max(0,Math.round(startedAt-run.started)),
  ms:Math.max(0,Math.round(endedAt-startedAt))})

/** One tool call; `startedAt` is performance.now() when it began. Input and output are clipped and scrubbed. */
export function recordTool(name:string,startedAt:number,input:unknown,output:unknown,error?:string) {
  const run=storage.getStore()
  if (!run||run.tools.length>=MAX_ENTRIES) return
  try {run.tools.push({name,...since(run,startedAt),input:clip(input),output:clip(output),...(error?{error:error.slice(0,200)}:{})})}
  catch {/* A debug record never breaks a meal. */}
}

export type ModelCallInput={kind:string;model:string;startedAt:number;promptTokens?:number;completionTokens?:number;
  costUsd?:number|null;status:string;detail?:string;output?:unknown
  /** When the model's part ended, if not now (an agent step also runs its tools before it finishes). */
  endedAt?:number}

/** One model call; `startedAt` is performance.now() when it began. */
export function recordModelCall(call:ModelCallInput) {
  const run=storage.getStore()
  if (!run||run.models.length>=MAX_ENTRIES) return
  try {
    run.models.push({kind:call.kind,model:call.model,...since(run,call.startedAt,call.endedAt),promptTokens:count(call.promptTokens),
      completionTokens:count(call.completionTokens),costUsd:cost(call.costUsd),status:call.status,
      ...(call.detail?{detail:call.detail.slice(0,200)}:{}),...(call.output!==undefined?{output:clip(call.output)}:{})})
  } catch {/* A debug record never breaks a meal. */}
}

/** One resolveMeal call (success or failure). The arrays are copied: the resolver may keep appending to its own. */
export function recordResolution(resolution:RunResolution) {
  const run=storage.getStore()
  if (!run||run.resolutions.length>=20) return
  try {
    run.resolutions.push({model:resolution.model,...(resolution.validationErrorCode?{validationErrorCode:resolution.validationErrorCode}:{}),
      timeline:resolution.timeline.slice(0,MAX_ENTRIES),trace:resolution.trace.slice(0,MAX_ENTRIES).map(line=>line.slice(0,200)),
      steps:resolution.steps,toolCalls:resolution.toolCalls,durationMs:Math.round(resolution.durationMs),
      ...(resolution.error?{error:resolution.error.slice(0,200)}:{})})
  } catch {/* A debug record never breaks a meal. */}
}

/** A raw OpenRouter chat-completions response: usage (prompt_tokens, completion_tokens, cost) and the message content
 * (parsed when it is JSON) as the output. `body` is null for a failed request (no tokens recorded). */
export function recordOpenRouterResponse(kind:string,model:string,startedAt:number,body:unknown,status:string,detail?:string) {
  if (!storage.getStore()) return
  const record=body&&typeof body==="object"?body as {usage?:Record<string,unknown>;choices?:{message?:{content?:unknown}}[]}:null
  const usage=record?.usage
  recordModelCall({kind,model,startedAt,status,detail,promptTokens:usage?.prompt_tokens as number,
    completionTokens:usage?.completion_tokens as number,costUsd:usage?.cost as number,
    output:record?messageOutput(record.choices?.[0]?.message?.content):undefined})
}

/** For a raw request's `.catch`: records the failed call (a timeout or a network error), then rethrows it unchanged. */
export const recordFailure=(kind:string,model:string,startedAt:number)=>(error:unknown):never=>{
  recordOpenRouterResponse(kind,model,startedAt,null,error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?
    "timeout":"error",error instanceof Error?error.message.slice(0,80):undefined)
  throw error
}

/** An AI SDK call (a generateText step or a finished stream): usage from the SDK, cost from OpenRouter's metadata. */
export function recordModelStep(kind:string,model:string,startedAt:number,step:{usage?:{inputTokens?:number;outputTokens?:number};
  providerMetadata?:Record<string,unknown>}|undefined,status:string,detail?:string,output?:unknown,endedAt?:number) {
  if (!storage.getStore()) return
  const openrouter=step?.providerMetadata?.openrouter as {usage?:{cost?:unknown}}|undefined
  recordModelCall({kind,model,startedAt,endedAt,status,detail,output,promptTokens:step?.usage?.inputTokens,
    completionTokens:step?.usage?.outputTokens,costUsd:openrouter?.usage?.cost as number})
}

/** Totals for a run's row. Cost is null when no call reported one (unknown, not free). */
export function mealRunTotals(run:MealRun) {
  const costs=run.models.flatMap(call=>call.costUsd==null?[]:[call.costUsd])
  return {modelCalls:run.models.length,toolCalls:run.tools.length,
    promptTokens:run.models.reduce((sum,call)=>sum+call.promptTokens,0),
    completionTokens:run.models.reduce((sum,call)=>sum+call.completionTokens,0),
    costUsd:costs.length?Math.round(costs.reduce((sum,value)=>sum+value,0)*1e6)/1e6:null}
}

const count=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?Math.round(value):0
const cost=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null

function messageOutput(content:unknown):unknown {
  if (typeof content!=="string") return content??null
  // Models sometimes wrap the JSON in a fence or a sentence: the object inside, else the text as it came.
  try {return JSON.parse(content)} catch {/* not bare JSON */}
  try {return JSON.parse(content.slice(content.indexOf("{"),content.lastIndexOf("}")+1))} catch {return content}
}

// Signed storage URLs carry a token that opens the user's photo: never stored. Inline images are only bulk.
const SIGNED=/token=|\/storage\/v1\/object\/sign\//i
const scrub=(_key:string,value:unknown)=>typeof value!=="string"?value:SIGNED.test(value)?"[signed-url]":
  value.startsWith("data:")&&value.length>200?"[data-url]":value

/** A JSON-safe copy of `value` for the record: signed URLs replaced, and anything longer than `max` characters as JSON
 * kept as {truncated, preview}. Never throws (a circular or unserialisable value becomes a string). */
export function clip(value:unknown,max=4000):unknown {
  let json:string|undefined
  try {json=JSON.stringify(value,scrub)}
  catch {
    let text:string
    try {text=String(value)} catch {text="[unserialisable]"}
    json=JSON.stringify(scrub("",text))
  }
  if (json===undefined) return null
  if (json.length>max) return {truncated:true,preview:json.slice(0,max)}
  try {return JSON.parse(json)} catch {return null}
}
