/** Where to go after signing in: only a path on this site (the OAuth consent page sends people here and back). */
export function safeNextPath(next: unknown) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null
  return next
}
