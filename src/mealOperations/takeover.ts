import { createHash } from "node:crypto"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { acceptMealOperation } from "./service"
import { dispatchMealOperation } from "./dispatch"
import type { OperationRequest } from "./contracts"
import type { Tables } from "types/supabase"

export type TakeoverMode = "off" | "photos" | "all"
const parseMode = (value: unknown): TakeoverMode => value === "off" || value === "all" ? value : "photos"

// A database flag (FeatureFlag.meal_resolver_adopt), cached briefly: flipping it
// takes effect within 30 s, with no deploy. Photos default to the meal agent.
let cached: { mode: TakeoverMode; at: number } | undefined
export async function takeoverMode(db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()): Promise<TakeoverMode> {
  if (cached && Date.now() - cached.at < 30_000) return cached.mode
  const { data, error } = await db.from("FeatureFlag" as never).select("value").eq("name", "meal_resolver_adopt").maybeSingle()
  const mode = error ? cached?.mode ?? "photos" : parseMode((data as { value?: string } | null)?.value)
  cached = { mode, at: Date.now() }
  return mode
}

export function shouldTakeOver(message: Pick<Tables<"Message">, "hasimages">, mode: TakeoverMode) {
  return mode === "all" || (mode === "photos" && message.hasimages)
}

// Stable keys make app retries of the same submission idempotent.
const stableUuid = (seed: string) => {
  const hex = createHash("sha256").update(seed).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

type Reply = { resultMessage: string; status: "PROCESSING" | "RESOLVED" | "FAILED"; itemsProcessed: number; itemsToProcess: number }

/** Resolve a message the current app created (or edited) through the operation
 * pipeline. Publication writes the same LoggedFoodItem rows the app already reads. */
export async function takeOverMessage(user: Pick<Tables<"User">, "id" | "tzIdentifier">, message: Tables<"Message">,
  consumedOn: string, editing: boolean, deps: { accept?: typeof acceptMealOperation; dispatch?: typeof dispatchMealOperation;
    db?: ReturnType<typeof createAdminSupabase>; /** A deliberate reprocess (not an app retry) needs a new operation. */ nonce?: string } = {}): Promise<Reply> {
  const db = deps.db ?? createAdminSupabase()
  const photos = await db.from("UserMessageImages").select("id").eq("messageId", message.id).eq("userId", user.id).order("id").limit(11)
  if (photos.error) throw new Error("media_evidence_unavailable")
  const revision = (message as { publishedRevision?: number }).publishedRevision ?? 0
  const input = { originalText: message.content ?? "", consumedOn, attachmentIds: (photos.data ?? []).map(photo => photo.id).slice(0, 10) }
  const seed = (editing ? `edit:${message.id}:${revision}:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}` : `create:${message.id}`) +
    (deps.nonce ? `:${deps.nonce}` : "")
  const request = { schemaVersion: 1, operationId: stableUuid(`takeover:${seed}`), clientMealId: stableUuid(`meal:${message.id}`),
    messageId: message.id, expectedPublishedRevision: editing ? revision : null, action: editing ? "replace" : "create",
    submittedAt: new Date(`${message.createdAt}Z`).toISOString(), timezone: user.tzIdentifier || "UTC", locale: null,
    input: { ...input, takeover: true } } as unknown as OperationRequest
  let accepted
  try { accepted = await (deps.accept ?? acceptMealOperation)(user.id, request) }
  catch (error) {
    if (error instanceof Error && /already active/.test(error.message))
      return { resultMessage: "Food items submitted and still processing.", status: "PROCESSING", itemsProcessed: 0, itemsToProcess: 0 }
    throw error
  }
  if (accepted.state === "queued") {
    try { await (deps.dispatch ?? dispatchMealOperation)(accepted.operationId) }
    catch (error) { console.error("meal_takeover_dispatch_failed", { operationId: accepted.operationId, error }) }
  }
  return { resultMessage: "Food items submitted and still processing.", status: "PROCESSING", itemsProcessed: 0, itemsToProcess: 0 }
}
