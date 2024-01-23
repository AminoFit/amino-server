import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

const supabaseAdmin = createAdminSupabase()

async function main() {
const { data, error } = await supabaseAdmin.from("IconQueue").select('*').is("requested_food_item_id", null)
console.log(data?.length)

}

main()