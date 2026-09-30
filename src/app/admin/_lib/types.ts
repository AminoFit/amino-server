// Row shapes returned by the admin SQL functions (supabase/migrations/20261001000000_admin_dashboard.sql) and the
// tables the generated types do not know yet.

export type MealKind = "text" | "photo" | "photo+text" | "voice" | "barcode"
export const MEAL_KINDS: MealKind[] = ["text", "photo", "photo+text", "voice", "barcode"]

export type MealListRow = {
  id: number; userId: string; email: string | null; content: string; createdAt: string; consumedOn: string | null
  resolvedAt: string | null; deletedAt: string | null; status: string; hasImages: boolean; isAudio: boolean | null
  opId: string | null; opAction: string | null; opState: string | null; route: string | null; attempts: number | null
  errorCode: string | null; durationMs: number | null; operations: number; edits: number; photos: number
  foods: { id: number; foodId: number | null; name: string | null; brand: string | null; grams: number; kcal: number | null
    unit: string | null; amount: number | null }[]
  kcal: number | null; itemCount: number; total: number
}

export type StatGroup = { dim: "kind" | "route"; key: string; n: number; succeeded: number; failed: number; clarified: number
  retried: number; edited: number; creates: number; p50: number | null; p90: number | null; items: number | null; avgCost: number | null }

export type MealStats = {
  summary: { n: number; succeeded: number; failed: number; clarified: number; pending: number; retried: number; edited: number
    creates: number; users: number; p50: number | null; p90: number | null; p95: number | null; items: number | null
    cost: number | null; avgCost: number | null; costed: number; avgTokens: number | null }
  groups: StatGroup[]
  daily: { day: string; kind: MealKind; n: number; failed: number; p50: number | null }[]
  latency: { kind: MealKind; bucket: string; n: number }[]
  errors: { code: string; n: number; last: string }[]
}

export type CatalogueStats = {
  totals: { foods: number; private: number; verified: number; withGtin: number; withoutIcon: number }
  bySource: { source: string; n: number; created: number }[]
  createdDaily: { day: string; source: string; n: number }[]
  topFoods: { id: number; name: string; brand: string | null; logs: number; users: number }[]
  activeDaily: { day: string; users: number; meals: number }[]
  bugs: { type: string | null; n: number }[]
}

export type Overview = {
  last24h: { n: number; succeeded: number; failed: number; clarified: number; pending: number; p50: number | null; users: number }
  stuck: { running: number; queued: number; retrying: number }
  outbox: { pending: number; oldest: string | null }
  processingMessages: number; foods24h: number; bugs7d: number; users7d: number
  flags: { name: string; value: string; updatedAt: string }[]
}

export type FoodListRow = {
  id: number; name: string; brand: string | null; foodInfoSource: string; verified: boolean; gtin: string | null
  privateToUserId: string | null; kcalPerServing: number; proteinPerServing: number; carbPerServing: number
  totalFatPerServing: number; defaultServingWeightGram: number | null; createdAtDateTime: string; icon: string | null
  logs: number; logs30d: number; users: number; lastLogged: string | null; total: number
}

export type UserListRow = { id: string; email: string | null; fullName: string | null; tzIdentifier: string
  subscriptionType: string | null; firstMessageAt: string | null; lastMessageAt: string | null; meals7d: number; meals30d: number
  totalMeals: number; foods30d: number; totalFoods: number; failed30d: number; total: number }

export type MealOperationRow = {
  id: string; userId: string; messageId: number; action: string; state: string; attempts: number; generation: number
  input: Record<string, unknown>; plan: PublishedPlan | null; result: Record<string, unknown> | null; answers: unknown
  errorCode: string | null; createdAt: string; updatedAt: string; completedAt: string | null; nextAttemptAt: string | null
  leaseUntil: string | null; expectedPublishedRevision: number | null
}

export type PublishedPlan = {
  originalText?: string; consumedOn?: string; model?: { id: string; provider: string }
  items: { logicalItemId?: string; foodId: number; grams: number; servingId: number | null; servingAmount: number
    loggedUnit: string; groupId?: string | null; groupLabel?: string | null; evidence?: string[]; origin?: string
    nutrition?: Record<string, number | null> }[]
  groups?: unknown[]; claims?: unknown[]; input?: Record<string, unknown>
}

export type RunTool = { name: string; atMs: number; ms: number; input: unknown; output: unknown; error?: string }
export type RunModelCall = { kind: string; model: string; atMs: number; ms: number; promptTokens: number; completionTokens: number
  costUsd: number | null; status: string; detail?: string; output?: unknown }
export type RunResolution = { model: string; validationErrorCode?: string; timeline: { stage: string; ms: number }[]
  trace: string[]; steps: number; toolCalls: number; durationMs: number }

export type MealRunRow = {
  id: number; operationId: string; messageId: number; userId: string; action: string; attempt: number; state: string
  errorCode: string | null; route: string | null; photoCount: number; itemCount: number | null; durationMs: number
  modelCalls: number; toolCalls: number; promptTokens: number; completionTokens: number; costUsd: number | null
  resolutions: RunResolution[]; tools: RunTool[]; models: RunModelCall[]; createdAt: string
}
