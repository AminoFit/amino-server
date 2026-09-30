import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { ADMIN_ALLOWED_USER_IDS } from "@/utils/admin/allowedUserIds"

/** Every admin page calls this before reading anything: a layout alone does not guard a page's own request.
 * Signed-out visitors go to the login page; signed-in non-admins get a 404 (the admin area is not advertised).
 * Cached per request, so the layout and the page share one auth check. */
export const requireAdmin = cache(async () => {
  const { data, error } = await createClient().auth.getUser()
  if (error || !data.user) redirect("/login")
  if (!ADMIN_ALLOWED_USER_IDS.includes(data.user.id)) notFound()
  return data.user
})
