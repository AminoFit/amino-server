import { foodMetric } from "@/foodResolution/telemetry"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import type { Tables } from "types/supabase"

export type ModelUsage={prompt_tokens?:number;completion_tokens?:number;total_tokens?:number;cost?:number}

export async function LogOpenAiUsage(
  user:Pick<Tables<"User">,"id">,usage:ModelUsage,modelName:string,provider:string,
  completionTimeMs:number|null=null
):Promise<void>{
  foodMetric("model_usage",completionTimeMs,"ok",{
    model:modelName,provider,promptTokens:usage.prompt_tokens,
    completionTokens:usage.completion_tokens,costUsd:usage.cost
  })
  const supabase=createAdminSupabase()
  const {error}=await supabase.from("OpenAiUsage").insert({
    promptTokens:usage.prompt_tokens??0,completionTokens:usage.completion_tokens??0,
    totalTokens:usage.total_tokens??0,userId:user.id,modelName,provider,
    completionTimeMs:completionTimeMs===null?null:Math.trunc(completionTimeMs)
  })
  if(error)console.error("Could not record model usage",{modelName,provider})
}
