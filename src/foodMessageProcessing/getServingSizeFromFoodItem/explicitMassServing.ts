import { LoggedFoodServing } from "@/utils/loggedFoodItemInterface"

// Restrict this shortcut to one leading mass quantity. Ranges, package weights,
// multiple quantities and volume units still require serving interpretation.
export function explicitMassServing(input: string): LoggedFoodServing | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(kilograms?|kg|grams?|g)\b\s+([^\d]+)$/i)
  if (!match || /\b(per|each|pack|package|container|bag|bottle)\b/i.test(match[3])) return null
  const amount = Number(match[1])
  const unit = /^(kg|kilogram)/i.test(match[2]) ? "kg" : "g"
  const grams = amount * (unit === "kg" ? 1000 : 1)
  if (!Number.isFinite(grams) || grams <= 0) return null
  return { serving_amount: amount, serving_name: unit, serving_g_or_ml: "g",
    total_serving_g_or_ml: grams, full_serving_string: `${amount} ${unit}` }
}
