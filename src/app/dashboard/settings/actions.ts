"use server"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"


export type UserSettingsProps = {
  tzIdentifier?: string
  fullName?: string
  dateOfBirth?: Date
  weightKg?: number | null
  heightCm?: number | null
}

export async function updateUserSettings(updatedSettings: UserSettingsProps) {
  const supabase = createServerActionClient({ cookies })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  // The settings are the columns themselves (this wrote a column named "updatedSettings", so nothing was saved).
  const { error } = await supabase.from("User").update(updatedSettings).eq("id", user.id)
  if (error) throw new Error(`Could not save settings: ${error.message}`)
}

type UnitPreference = "IMPERIAL" | "METRIC"

export type UserPreferencesProps = {
  unitPreference?: UnitPreference
}

export async function updateUserPreferences(updatedSettings: UserPreferencesProps) {
  const supabase = createServerActionClient({ cookies })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  const { error } = await supabase.from("User").update({ updatedSettings }).eq("id", user.id)
}
