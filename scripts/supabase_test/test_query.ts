import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

const supabaseAdmin = createAdminSupabase()

async function main() {
  const { data, error } = await supabaseAdmin.from("IconQueue").select("*")
  console.log(data)
  console.log(error)
}

main()
