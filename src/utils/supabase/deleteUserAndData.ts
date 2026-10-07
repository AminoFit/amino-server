import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

/** Deletes a user's data (public.delete_user_data, one transaction), then their auth user, which cascades to User and
 * its own tables. Private foods other users logged or cook with stay, archived. Stops at the first error, so a
 * half-deleted account is never reported as deleted. */
export async function deleteUserAndData(userId: string) {
  const db = createAdminSupabase()
  const { data, error: dataError } = await (db as any).rpc("delete_user_data", { p_user_id: userId })
  if (dataError) {
    console.error("delete_user_data failed", dataError)
    return { error: "Couldn't delete your data. Try again." }
  }
  const { error } = await db.auth.admin.deleteUser(userId)
  if (error) {
    console.error("auth deleteUser failed", error)
    return { error: "Couldn't delete your account. Try again." }
  }
  console.log("Deleted user and data", data)
  return { success: true }
}
