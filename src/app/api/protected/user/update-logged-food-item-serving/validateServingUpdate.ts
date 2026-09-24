export type ServingUpdate = {
  grams: number
  foodItemId?: number | null
  servingId?: number | null
  servingAmount?: number | null
  loggedUnit?: string | null
}

const mutableFields = new Set(["grams", "foodItemId", "servingId", "servingAmount", "loggedUnit"])

export function validateServingUpdate(value: unknown): ServingUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(field => !mutableFields.has(field))) return null
  if (typeof input.grams !== "number" || !Number.isFinite(input.grams) || input.grams <= 0) return null
  if (input.foodItemId !== undefined && input.foodItemId !== null &&
      (typeof input.foodItemId !== "number" || !Number.isSafeInteger(input.foodItemId) || input.foodItemId <= 0)) return null
  if (input.servingId !== undefined && input.servingId !== null &&
      (typeof input.servingId !== "number" || !Number.isSafeInteger(input.servingId) || input.servingId <= 0)) return null
  if (input.servingAmount !== undefined && input.servingAmount !== null &&
      (typeof input.servingAmount !== "number" || !Number.isFinite(input.servingAmount) || input.servingAmount <= 0)) return null
  if (input.loggedUnit !== undefined && input.loggedUnit !== null &&
      (typeof input.loggedUnit !== "string" || !input.loggedUnit.trim() || input.loggedUnit.length > 128)) return null
  return input as ServingUpdate
}
