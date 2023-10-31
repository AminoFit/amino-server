export const SupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
export const SupabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""

if (SupabaseServiceKey === "") {
  throw new Error("No SUPABASE_SERVICE_ROLE_KEY env variable set")
}
if (SupabaseURL === "") {
  throw new Error("No NEXT_PUBLIC_SUPABASE_URL env variable set")
}
