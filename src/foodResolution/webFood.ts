import { foodModel } from "@/ai/models"
import { LogOpenAiUsage } from "@/languageModelProviders/openai/utils/openAiHelper"
import type { Tables } from "types/supabase"

export type WebFoodResult = {data:unknown;sourceUrls:string[];searches:number}

export function parseWebFoodResponse(body: any): WebFoodResult {
  const choice=body?.choices?.[0]
  if(choice?.finish_reason!=="stop"||typeof choice.message?.content!=="string") {
    throw new Error("Web food response did not finish")
  }
  const text=choice.message.content.trim()
  const fenced=text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const data=JSON.parse(fenced ? fenced[1] : text)
  const sourceUrls=[...new Set<string>((choice.message.annotations ?? [])
    .filter((entry:any)=>entry?.type==="url_citation")
    .map((entry:any)=>entry.url_citation?.url)
    .filter((url:unknown):url is string=>typeof url==="string"&&/^https?:\/\//i.test(url)))]
  return {data,sourceUrls,searches:body.usage?.server_tool_use_details?.web_search_requests ?? 0}
}

export async function resolveWebFood(system:string,prompt:string,user:Tables<"User">):Promise<WebFoodResult> {
  const model=foodModel()
  const key=process.env.OPENROUTER_API_KEY||process.env.OPEN_ROUTER_API_KEY
  if(!key)throw new Error("OpenRouter unavailable")
  const started=Date.now(),signal=AbortSignal.timeout(45000)
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},signal,
    body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:prompt}],
      response_format:{type:"json_object"},max_tokens:3000,temperature:1,
      reasoning:{effort:"low",exclude:true},provider:{require_parameters:true},
      tools:[{type:"openrouter:web_search",parameters:{engine:"exa",mode:"fast",max_uses:2,
        max_results:5,max_total_results:10,max_characters:4000}}],max_tool_calls:2})
  })
  if(!response.ok){await response.body?.cancel();throw new Error(`Web food request failed (${response.status})`)}
  const body=await response.json(),parsed=parseWebFoodResponse(body)
  if(!parsed.sourceUrls.length)throw new Error("Web food response had no source citations")
  if(body.usage){try{await LogOpenAiUsage(user,body.usage,model,"openrouter",Date.now()-started)}
    catch{console.error("Could not record web food usage")}}
  return parsed
}

export function citedSource(url:unknown,available:string[]):string|null {
  if(typeof url!=="string")return null
  try{
    const candidate=new URL(url)
    return available.some(item=>{const known=new URL(item);return candidate.href===known.href})?candidate.href:null
  }catch{return null}
}
