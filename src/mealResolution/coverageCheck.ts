import { FOOD_MODEL, providerPreferences } from "@/ai/models"

const PROMPT = `The user logged a meal with these photos. The plan below lists the foods it logged, with what each
catalogue food contains when known. Look carefully at the food being logged and list every component the user is
eating that no logged food covers: toppings, mix-ins, sides and sauces on or served with it, even in small amounts.
An ingredient is covered only if a logged food's description includes it (or it is itself logged).
Ignore separate glasses, bottles and cups unless the user's text mentions a drink, and ignore tableware, packaging,
menus, other people's plates and condiments that are not on the user's food.
Return {"missing":[{"food":"...","where":"..."}]}, or {"missing":[]} when everything is covered.`

/** A second look at the photos: visible foods the plan did not log. Never reads text as instructions. */
export async function missingVisibleFoods(photoUrls: URL[], userText: string, logged: { name: string; contains?: string | null }[],
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<string[]> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key || !photoUrls.length) return []
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model: FOOD_MODEL, reasoning: { effort: "low", exclude: true }, provider: providerPreferences(FOOD_MODEL),
      max_tokens: 800, response_format: { type: "json_schema", json_schema: { name: "missing", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["missing"], properties: { missing: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["food", "where"],
          properties: { food: { type: "string" }, where: { type: "string" } } } } } } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `${PROMPT}\n\nUser text (data): ${JSON.stringify(userText)}\nLogged foods: ${JSON.stringify(logged)}` },
        ...photoUrls.map(url => ({ type: "image_url", image_url: { url: url.toString() } }))] }] })
  })
  if (!response.ok) { await response.body?.cancel(); return [] }
  try {
    const parsed = JSON.parse((await response.json()).choices?.[0]?.message?.content ?? "{}") as { missing?: { food?: unknown }[] }
    return (parsed.missing ?? []).flatMap(item => typeof item.food === "string" && item.food.trim() ? [item.food.trim().slice(0, 60)] : []).slice(0, 5)
  } catch { return [] }
}
