import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// The generated types predate the meal-operation tables and the admin functions, so admin reads go through an
// untyped client and cast rows to the shapes in ./types.
export const adminDb = () => createAdminSupabase() as unknown as SupabaseClient<any, "public", any>

/** Throws with the table or function name so a failed read shows on the error page instead of an empty table. */
export function must<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data as T
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return must(name, await adminDb().rpc(name, args))
}

/** Signed URLs for private meal photos, one storage call for the whole page. Keyed by image path. */
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  if (!unique.length) return new Map()
  const { data, error } = await adminDb().storage.from("userUploadedImages").createSignedUrls(unique, 3600)
  if (error) throw new Error(`photos: ${error.message}`)
  return new Map((data ?? []).flatMap(item => item.path && item.signedUrl ? [[item.path, item.signedUrl] as [string, string]] : []))
}
