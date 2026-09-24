import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

export type Candidate = { id: number; name: string; brand: string | null }
export type Serving = { id: number; foodItemId: number; servingName: string; servingWeightGram: number | null;
  defaultServingAmount: number | null }
export type EvidenceFood = Candidate & { defaultServingWeightGram: number | null; weightUnknown: boolean;
  kcalPerServing: number | null; proteinPerServing: number | null; carbPerServing: number | null;
  totalFatPerServing: number | null; Serving: Serving[]; servingsTruncated?: boolean }
export type AgentInput = { user: { id: string; tzIdentifier: string }; messageId: number; referenceTime: string;
  item: FoodItemToLog; candidates: Candidate[] }
export type Proposal = { decision: "match" | "unmatched"; foodId: number | null; servingId: number | null }
export type Resolution = { foodId: number; servingId: number | null; grams: number;
  kcal: number; proteinG: number | null; carbG: number | null; totalFatG: number | null }
export type AgentStatus = "matched" | "unmatched" | "invalid_proposal" | "unavailable" | "deadline" | "budget_exhausted" | "capacity" | "fallback_disabled" | "unsupported_input"
export type AgentResult = { status: AgentStatus; resolution?: Resolution; durationMs: number;
  steps: number; toolCalls: number; toolErrors: number; promptTokens: number; completionTokens: number; costUsd?: number; model: string; provider: string;
  strategy?: "jev_gemini"; route?: "jev" | "gemini" | "none"; fallbackReason?: string;
  selectorModel?: string; selectorStatus?: string; selectorConfidence?: number; selectorDurationMs?: number;
  prefetchDurationMs?: number; candidateCount?: number; validOptionCount?: number }
