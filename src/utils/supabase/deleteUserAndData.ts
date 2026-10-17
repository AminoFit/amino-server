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
  // Meal and label photos live in the private bucket under the user's folder; nothing in the database removes them.
  const photosError = await deletePhotos(db, userId)
  if (photosError) {
    console.error("photo deletion failed", photosError)
    return { error: "Couldn't delete your photos. Try again." }
  }
  const { error } = await db.auth.admin.deleteUser(userId)
  if (error) {
    console.error("auth deleteUser failed", error)
    return { error: "Couldn't delete your account. Try again." }
  }
  console.log("Deleted user and data", data)
  return { success: true }
}

/** Every file in userUploadedImages/<userId>/, a page at a time. Returns the first error, or null. */
async function deletePhotos(db: ReturnType<typeof createAdminSupabase>, userId: string) {
  const bucket = db.storage.from("userUploadedImages")
  for (;;) {
    const { data: files, error } = await bucket.list(userId, { limit: 1000 })
    if (error) return error
    if (!files?.length) return null
    const { error: removeError } = await bucket.remove(files.map(file => `${userId}/${file.name}`))
    if (removeError) return removeError
    if (files.length < 1000) return null
  }
}
