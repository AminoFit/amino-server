//src/utils/supabase/serverAdmin.ts
// "use server"
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"

export const createAdminSupabase = () => {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    }
  })

  return supabase
}
