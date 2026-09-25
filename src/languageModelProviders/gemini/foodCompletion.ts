import { Tables } from "types/supabase"
import { FOOD_MODEL, foodModel } from "@/ai/models"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"

export const FOOD_REASONING_MODEL = FOOD_MODEL

export async function foodCompletion(options: {
  model?: string
  systemPrompt: string
  userMessage: string
  imageUrls?: string[]
  max_tokens?: number
  temperature?: number
  response_format?: string
}, user: Tables<"User">): Promise<string> {
  const model = foodModel()
  if (options.model && options.model !== model) {
    throw new Error(`Unsupported food model: ${options.model}`)
  }
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) throw new Error("OpenRouter unavailable")

  const started = Date.now()
  const signal = AbortSignal.timeout(options.imageUrls?.length ? 60000 : 45000)
  const userContent = options.imageUrls?.length ? [
    {type:"text",text:options.userMessage},
    ...options.imageUrls.map(url=>({type:"image_url",image_url:{url,detail:"high"}}))
  ] : options.userMessage
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
      signal,
      body: JSON.stringify({model,messages:[
        {role:"system",content:options.systemPrompt},
        {role:"user",content:userContent}
      ],response_format:{type:"json_object"},max_tokens:options.max_tokens ?? 4096,
      temperature:1,reasoning:{effort:"low",exclude:true},provider:{require_parameters:true}})
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue
      throw new Error(`Flash food request failed (${response.status})`)
    }
    const result = await response.json()
    if (result.choices?.[0]?.finish_reason !== "stop") {
      throw new Error("Flash food response did not finish successfully")
    }
    const content = result.choices[0].message?.content
    if (typeof content !== "string") throw new Error("Flash returned no food response")
    JSON.parse(content)
    if (result.usage) {
      try { await LogOpenAiUsage(user,result.usage,model,"openrouter",Date.now()-started) }
      catch { console.error("Could not record Flash food usage") }
    }
    return content
  }
  throw new Error("Flash food request unavailable")
}
