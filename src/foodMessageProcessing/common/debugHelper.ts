import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email).single()

  if (error) {
    console.error(error)
    return null
  }

  return data
}

export async function getUserById(userId: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("id", userId).single()

  if (error) {
    console.error(error)
    return null
  }

  return data
}

export async function getUserMessageById(userId: number) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("Message").select("*").eq("id", userId).single()

  if (error) {
    console.error(error)
    return null
  }

  return data
}
