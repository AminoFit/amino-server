import { explicitMassServing } from "@/foodMessageProcessing/getServingSizeFromFoodItem/explicitMassServing"
import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import type { EvidenceFood, Proposal, Resolution, Serving } from "./types"
import { foodNutrition } from "../nutrition"
import { missingExplicitAdditions, matchesExplicitMilkVariant } from "../composition"

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()
const singular = (text: string) => text.replace(/s$/,"")
const quantities: Record<string, number> = { a:1, an:1, one:1, two:2, three:3, four:4, half:.5 }

// Deliberately conservative: no model estimates, unit inference, package arithmetic
// or density assumptions. More serving shapes need labelled tests before admission.
function householdGrams(text: string, serving: Serving): number | null {
  const match = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|half)\s+(?:a\s+|an\s+)?([a-z]+)\b/)
  if (!match || !positive(serving.servingWeightGram) || !positive(serving.defaultServingAmount)) return null
  const amount = quantities[match[1]] ?? Number(match[1])
  const unit = singular(match[2])
  if (!positive(amount) || !["cup","tbsp","tsp","scoop","slice","piece","egg","banana","apple"].includes(unit)) return null
  const label = normal(serving.servingName)
  // Only bare unit labels or integer-labelled servings with an agreeing amount.
  const labelled = label.match(/^(?:(\d+) )?([a-z]+)$/)
  if (!labelled || singular(labelled[2]) !== unit ||
      (labelled[1] && Number(labelled[1]) !== serving.defaultServingAmount)) return null
  // Reject other explicit amounts/modifications instead of ignoring them.
  const rest = text.trim().slice(match[0].length).replace(/\b\d+(?:\.\d+)?\s*%/g,"")
  if (/\d|\b(half|double|extra|heaped|heaping|large|small|medium|per|each|pack|without|instead)\b/i.test(rest)) return null
  return amount * serving.servingWeightGram / serving.defaultServingAmount
}

export function validateProposal(proposal: Proposal, item: FoodItemToLog, foods: Map<number, EvidenceFood>): Resolution | null {
  if (proposal.decision !== "match" || !Number.isSafeInteger(proposal.foodId)) return null
  const food = foods.get(proposal.foodId!) // Only evidence actually read by this run.
  if (!food || food.id !== proposal.foodId || food.weightUnknown || !positive(food.defaultServingWeightGram)) return null
  if (missingExplicitAdditions(item,food.name).length) return null
  if (!matchesExplicitMilkVariant(item,food.name)) return null
  if (item.branded && !item.brand?.trim()) return null
  if (item.brand?.trim() && normal(item.brand) !== normal(food.brand ?? "")) return null
  const text = item.full_item_user_message_including_serving
  const requested = normal(item.food_database_search_name + " " + text).replace(/\buncooked\b/g,"raw")
  const identity = normal(food.name)
  for (const [state, opposite] of [["cooked","raw"],["raw","cooked"],["cooked","dry"],["dry","cooked"]]) {
    if (new RegExp(`\\b${state}\\b`).test(requested) &&
        (!new RegExp(`\\b${state}\\b`).test(identity) || new RegExp(`\\b${opposite}\\b`).test(identity))) return null
  }
  if (/\b(same|usual|yesterday|regular|without|instead)\b/i.test(text)) return null // Reference reuse owns these.
  const portionText=/\bmilk\b/i.test(text) ? text.replace(/\b\d+(?:\.\d+)?\s*%/g,"") : text
  const explicit = explicitMassServing(portionText)
  let grams: number | null = null
  if (explicit) {
    if (proposal.servingId !== null) return null
    grams = explicit.total_serving_g_or_ml
  } else {
    const serving = food.Serving.find(s=>s.id === proposal.servingId && s.foodItemId === food.id)
    if (!serving) return null
    grams = householdGrams(text,serving)
  }
  if (!positive(grams) || grams > 5000) return null
  const nutrition = foodNutrition(food,grams)
  return nutrition ? {foodId:food.id,servingId:proposal.servingId,grams,...nutrition} : null
}
