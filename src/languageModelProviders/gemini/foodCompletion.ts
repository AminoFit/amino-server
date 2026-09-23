import { Tables } from "types/supabase"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"

export const FOOD_REASONING_MODEL = process.env.FOOD_REASONING_MODEL ?? "gpt-4o-mini"

// Use the documented REST fields: the installed legacy GenAI SDK drops
// thinkingLevel and sends a Gemini 2.x thinkingBudget instead.
export async function foodCompletion(options: {
  model?: string
  systemPrompt: string
  userMessage: string
  max_tokens?: number
  temperature?: number
  response_format?: string
}, user: Tables<"User">): Promise<string> {
  const model = options.model ?? FOOD_REASONING_MODEL
  if (!model.startsWith("gemini-")) return openAiFoodCompletion(options, user, model)
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Gemini API key is not configured")
  const started = Date.now()
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: options.userMessage }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: Math.max(options.max_tokens ?? 4096, 4096),
        temperature: 1,
        thinkingConfig: model.startsWith("gemini-3") ? { thinkingLevel: "low" } : { thinkingBudget: 0 }
      }
    })
  })
  if (!response.ok) {
    if ([403, 404, 429].includes(response.status) || response.status >= 500) {
      console.warn("Gemini unavailable; using food fallback", { status: response.status, model })
      return openAiFoodCompletion(options, user, "gpt-4o-mini")
    }
    throw new Error(`Gemini food request failed (${response.status})`)
  }
  const result = await response.json()
  const candidate = result.candidates?.[0]
  if (candidate?.finishReason !== "STOP") throw new Error("Gemini food response did not finish successfully")
  const text = candidate.content?.parts?.filter((part: { thought?: boolean; text?: string }) => !part.thought)
    .map((part: { text?: string }) => part.text ?? "").join("")
  if (!text) throw new Error("Gemini returned no food response")
  JSON.parse(text) // Reject truncated or malformed JSON before downstream parsing.
  const usage = result.usageMetadata
  if (usage) {
    try {
      await LogOpenAiUsage(user, {
        prompt_tokens: usage.promptTokenCount ?? 0,
        completion_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        total_tokens: usage.totalTokenCount ?? 0
      }, model, "gemini", Date.now() - started)
    } catch {
      console.error("Could not record Gemini food usage")
    }
  }
  return text
}

async function openAiFoodCompletion(options: { systemPrompt: string; userMessage: string; max_tokens?: number }, user: Tables<"User">, model: string) {
  const useOpenRouter = model.includes("/")
  const provider = useOpenRouter ? "openrouter" : "openai"
  const apiKey = useOpenRouter
    ? (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY)
    : process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error(`${provider} food API key is not configured`)
  const started = Date.now()
  const response = await fetch(useOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model, messages: [
      { role: "system", content: options.systemPrompt }, { role: "user", content: options.userMessage }
    ], response_format: { type: "json_object" }, max_tokens: Math.max(options.max_tokens ?? 4096, 4096),
    temperature: useOpenRouter ? 1 : 0,
    ...(useOpenRouter ? { reasoning: { effort: "low", exclude: true }, provider: { require_parameters: true } } : {}) })
  })
  if (!response.ok) {
    if (useOpenRouter && ([402, 403, 404, 429].includes(response.status) || response.status >= 500)) {
      console.warn("OpenRouter unavailable; using food fallback", { status: response.status, model })
      return openAiFoodCompletion(options, user, "gpt-4o-mini")
    }
    throw new Error(`${provider} food request failed (${response.status})`)
  }
  const result = await response.json()
  if (result.choices?.[0]?.finish_reason !== "stop") throw new Error(`${provider} food response did not finish successfully`)
  const text = result.choices[0].message.content
  JSON.parse(text)
  if (result.usage) {
    try { await LogOpenAiUsage(user, result.usage, model, provider, Date.now() - started) }
    catch { console.error("Could not record OpenAI food usage") }
  }
  return text as string
}
