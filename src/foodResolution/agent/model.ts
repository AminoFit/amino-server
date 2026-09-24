import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"

// Same selection rules as the current matcher. No automatic model fallback in
// shadow: errors must remain visible in comparisons rather than change models.
export function agentModel(env: NodeJS.ProcessEnv = process.env) {
  const id = env.FOOD_REASONING_MODEL ?? "gpt-4o-mini"
  if (id.includes("/")) {
    const apiKey = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
    if (!apiKey) throw new Error("OpenRouter unavailable")
    return {id,provider:"openrouter",model:createOpenRouter({apiKey}).chat(id,{
      provider:{require_parameters:true},reasoning:{effort:"low"}
    })}
  }
  if (id.startsWith("gemini-")) {
    if (!env.GEMINI_API_KEY) throw new Error("Gemini unavailable")
    return {id,provider:"google",model:createGoogleGenerativeAI({apiKey:env.GEMINI_API_KEY})(id)}
  }
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI unavailable")
  return {id,provider:"openai",model:createOpenAI({apiKey:env.OPENAI_API_KEY}).chat(id)}
}

export function fallbackAgentModel(env: NodeJS.ProcessEnv = process.env) {
  return agentModel({...env,FOOD_REASONING_MODEL:env.FOOD_FALLBACK_MODEL ?? "google/gemini-3.8-flash"})
}
