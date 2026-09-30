// Shapes returned by the web_* functions (supabase/migrations/20261003000000_web_dashboard.sql).

export type Goals = { kcal: number; proteinG: number; carbG: number; totalFatG: number }

export type FoodRow = {
  id: number
  name?: string
  brand?: string
  amount?: number
  unit?: string
  grams?: number
  icon?: string
  kcal: number
  proteinG: number
  carbG: number
  totalFatG: number
  fiberG: number
}

export type Meal = {
  id: number
  time: string
  text?: string
  input: "photo" | "voice" | "text"
  status: "logged" | "failed" | "processing"
  photos?: string[]
  items: FoodRow[]
}

/** A day's meals; photo paths are swapped for signed URLs before they reach the browser. */
export type Day = { date: string; meals: Meal[] }

export type DayTotals = { date: string; meals: number; kcal: number; proteinG: number; carbG: number; totalFatG: number; fiberG: number }

export type TopFood = { id: number; name?: string; brand?: string; icon?: string; times: number; kcal: number }

export type Dashboard = {
  timezone: string
  today: string
  goals: Goals
  name?: string
  email?: string
  day: Day
  week: DayTotals[]
  recent: DayTotals[]
  stats: { streak: number; topFoods: TopFood[] }
}

export type AgentUsage = {
  clientId: string
  calls: number
  failed: number
  avgMs: number
  lastUsedAt: string
  tools: { tool: string; calls: number }[]
  days: Record<string, number>
}

export type Agent = {
  id: string
  name: string
  uri: string | null
  logoUri: string | null
  grantedAt: string
  usage: AgentUsage | null
}

/** A day and its week, as the day route returns them. */
export type DayWithWeek = { day: Day; week: DayTotals[] }
