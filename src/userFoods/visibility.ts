// Who may see a food, for server reads: they use the service role, which bypasses row security. This mirrors
// public.food_visible (20261015000000): the shared catalogue and the user's own private foods (and, with sharing,
// foods shared with them). Every server read of foods on a user's behalf filters through here, so the rule lives in
// one place on each side.

type FoodOwner = { privateToUserId: string | null; lineageId?: number | null }

/** A PostgREST `.or()` filter for the FoodItem rows this user may see. */
export function visibleFoodFilter(userId: string): string {
  return `privateToUserId.is.null,privateToUserId.eq.${userId}`
}

/** The catalogue and this user's own foods, never foods shared with them: the space a barcode is unique in. */
export function catalogueOrOwnFilter(userId: string | null): string {
  return userId ? `privateToUserId.is.null,privateToUserId.eq.${userId}` : "privateToUserId.is.null"
}

/** Whether this user may see this food. */
export function canSeeFood(userId: string, food: FoodOwner): boolean {
  return !food.privateToUserId || food.privateToUserId === userId
}
