import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { Tables } from "types/supabase"
import { oauthClaims } from "@/mcp/auth"

export async function GetAminoUserOnRequest() {
  const cookieStore = cookies()

  const token = cookieStore.get("sb-localhost-auth-token")

  if (!token) {
    return {
      error: "No token provided"
    }
  }
  // A connected agent's token (OAuth) works only at /api/mcp, where the user's agent settings apply.
  if (oauthClaims(token.value)) return { error: "Agent sessions can't do this" }

  // Initialize Supabase client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  )

  // Use the token to retrieve the user session
  const { data, error } = await supabaseAdmin.auth.getUser(token.value)

  if (error) {
    return {
      error: error.message
    }
  }

  // Now that you have the user, you can use it to fetch user-specific data or perform other actions
  // res.status(200).json({ user })

  const response = await supabaseAdmin
    .from("User")
    .select()
    .eq("id", data.user.id)
    .single()

  if (response.error) {
    console.log("Error retrieving amino user:", response.error)
    return {
      error: response.error.message
    }
  }

  const aminoUser = response.data as Tables<"User">

  // console.log("aminoUser", aminoUser)

  if (!aminoUser) {
    console.log("No amino user for authenticated user")
    return {
      error: "No amino user for authenticated user"
    }
  }

  // console.log("Amino User Auth'd")
  return { aminoUser }
}
