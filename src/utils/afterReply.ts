import { waitUntil } from "@vercel/functions"

/** Work the caller doesn't need to wait for (icons, categories, a meal's food-list flag, queue dispatch, push): it runs
 * after the response is sent, and Vercel keeps the function alive until it finishes. Outside Vercel (tests, local dev)
 * the work simply runs on. A failure is logged under `label`, never thrown: the reply has already gone. */
export function afterReply(label: string, work: () => Promise<unknown>) {
  waitUntil(Promise.resolve().then(work).catch(error =>
    console.error(`${label}_failed`, { error: error instanceof Error ? error.message : String(error) })))
}
