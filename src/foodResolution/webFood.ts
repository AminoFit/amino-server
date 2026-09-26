import { foodModel, providerPreferences } from "@/ai/models"
import { LogOpenAiUsage } from "@/languageModelProviders/openai/utils/openAiHelper"
import type { Tables } from "types/supabase"

export type WebFoodResult = {data:unknown;sourceUrls:string[];searches:number;costUsd?:number}

export function parseWebFoodResponse(body: any): WebFoodResult {
  const choice=body?.choices?.[0]
  if(choice?.finish_reason!=="stop"||typeof choice.message?.content!=="string") {
    throw new Error("Web food response did not finish")
  }
  // Models sometimes wrap the JSON in a fence or add a sentence around it.
  const text=choice.message.content.trim()
  const fenced=text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
  const braces=text.indexOf("{")>=0?text.slice(text.indexOf("{"),text.lastIndexOf("}")+1):text
  const data=JSON.parse(fenced ?? braces)
  const sourceUrls=[...new Set<string>((choice.message.annotations ?? [])
    .filter((entry:any)=>entry?.type==="url_citation")
    .map((entry:any)=>entry.url_citation?.url)
    .filter((url:unknown):url is string=>typeof url==="string"&&/^https?:\/\//i.test(url)))]
  return {data,sourceUrls,searches:body.usage?.server_tool_use_details?.web_search_requests ?? 0,
    ...(typeof body.usage?.cost==="number"?{costUsd:body.usage.cost}:{})}
}

export async function resolveWebFood(system:string,prompt:string,user:Pick<Tables<"User">,"id">,
  options:{model?:string}={}):Promise<WebFoodResult> {
  const started=Date.now(),model=options.model??foodModel()
  const {body,parsed}=await requestWebFood(system,prompt,model)
  if(body.usage){try{await LogOpenAiUsage(user,body.usage,model,"openrouter",Date.now()-started)}
    catch{console.error("Could not record web food usage")}}
  return parsed
}

/** One cited web-search extraction, without usage logging. */
export async function requestWebFood(system:string,prompt:string,model:string=foodModel()) {
  const key=process.env.OPENROUTER_API_KEY||process.env.OPEN_ROUTER_API_KEY
  if(!key)throw new Error("OpenRouter unavailable")
  const signal=AbortSignal.timeout(40000)
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},signal,
    body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:prompt}],
      // No sampling parameters: current Claude models reject them, and
      // require_parameters would then leave no provider.
      response_format:{type:"json_object"},max_tokens:4000,
      reasoning:{effort:"low",exclude:true},provider:providerPreferences(model),
      tools:[{type:"openrouter:web_search",parameters:{engine:"exa",max_uses:3,
        max_results:5,max_total_results:12,max_characters:4000}}],max_tool_calls:3})
  })
  if(!response.ok){await response.body?.cancel();throw new Error(`Web food request failed (${response.status})`)}
  const body=await response.json(),parsed=parseWebFoodResponse(body)
  if(!parsed.sourceUrls.length)throw new Error("Web food response had no source citations")
  return {body,parsed}
}

export function citedSource(url:unknown,available:string[]):string|null {
  if(typeof url!=="string")return null
  try{
    const candidate=new URL(url)
    return available.some(item=>{const known=new URL(item);return candidate.href===known.href})?candidate.href:null
  }catch{return null}
}
