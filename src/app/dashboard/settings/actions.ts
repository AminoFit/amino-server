"use server"
import { prisma } from "@/database/prisma"
import { getSession } from "@auth0/nextjs-auth0"

export async function getUser() {
  const session = await getSession()
  if (session?.user) {
    const aminoUser = await prisma.user.upsert({
      where: {
        email: session.user.email
      },
      update: {},
      create: {
        email: session.user.email,
        firstName: session.user.name
      }
    })

    return aminoUser
  }
  return
}

export type UserSettingsProps = {
  tzIdentifier?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: Date
  weightKg?: number | null
  heightCm?: number | null
}

export async function updateUserSettings(updatedSettings: UserSettingsProps) {
  const session = await getSession()

  if (session?.user) {
    let user = await prisma.user.update({
      where: {
        email: session.user.email
      },
      data: {
        ...updatedSettings
      }
    })
    return user
  }
  return
}

type UnitPreference = "IMPERIAL" | "METRIC"

export type UserPreferencesProps = {
  unitPreference?: UnitPreference
}

export async function updateUserPreferences(updatedSettings: UserPreferencesProps) {
  const session = await getSession()

  if (session?.user) {
    let user = await prisma.user.update({
      where: {
        email: session.user.email
      },
      data: {
        ...updatedSettings
      }
    })
    return user
  }
  return
}
