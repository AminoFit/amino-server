import type { foodSummary } from "./evidence"
import type { VisibleFood } from "./coverageCheck"

/** What the app can show while a meal resolves: the stage and, after the first look at a photo, a greyed preview. */
export type MealProgressStage = "reading" | "matching" | "found" | "checking" | "saving"
export type MealPreviewItem = { name: string; foodId: number | null; grams: number | null; kcal: number | null;
  proteinG: number | null; carbG: number | null; totalFatG: number | null; icon?: string | null }
export type VisibleWithCandidates = VisibleFood & { catalogue: ReturnType<typeof foodSummary>[] }

const scaled = (value: number | null | undefined, grams: number | null, basis: number | null | undefined) =>
  value != null && grams != null && basis ? Math.round(value * grams / basis * 10) / 10 : null
const round = (value: number | null | undefined) => value == null ? null : Math.round(value * 10) / 10

/** One preview item per visible component, in the first look's own words ("avocado slices"), with its own estimate for
 * the visible amount (it sees cooked rice as cooked). A catalogue candidate only lends its icon, or its energy density
 * when the first look gave no estimate. A preview only; the saved meal replaces it. */
export function buildPreview(visible: VisibleWithCandidates[]): MealPreviewItem[] {
  return visible.slice(0, 8).map(item => {
    const candidate = item.catalogue[0], grams = item.grams != null && item.grams > 0 ? Math.round(item.grams) : null
    const basis = candidate?.servingGrams ?? null, own = item.estimate
    return { name: item.food, foodId: candidate?.id ?? null, grams,
      kcal: round(own?.kcal) ?? scaled(candidate?.kcal, grams, basis), proteinG: round(own?.proteinG) ?? scaled(candidate?.proteinG, grams, basis),
      carbG: round(own?.carbG) ?? scaled(candidate?.carbG, grams, basis), totalFatG: round(own?.totalFatG) ?? scaled(candidate?.totalFatG, grams, basis) }
  })
}
