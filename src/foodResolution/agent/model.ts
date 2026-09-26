import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { foodModel, providerPreferences } from "@/ai/models"

export function agentModel(env: NodeJS.ProcessEnv = process.env) {
  const id = foodModel(env)
  const apiKey = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!apiKey) throw new Error("OpenRouter unavailable")
  return {id,provider:"openrouter",model:createOpenRouter({apiKey}).chat(id,{
    provider:providerPreferences(id),reasoning:{effort:"low"}
  })}
}

// Jev abstention reuses Flash and the evidence already collected.
export const fallbackAgentModel = agentModel
