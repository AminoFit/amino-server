import { prisma } from "@/database/prisma"
import { NextRequest } from "next/server"

export type UserSettingsProps = {
  tzIdentifier?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: Date
  weightKg?: number | null
  heightCm?: number | null
}

export async function getUserFromRequest(request: NextRequest) {
  const userInfo = request.headers.get("x-amino-user")

  if (!userInfo) {
    throw new Error("Missing user info on request")
  }

  const idTokenInfo = JSON.parse(userInfo)

  if (!idTokenInfo) {
    throw new Error("Error parsing user info")
  }

  // Get or Create the user
  const upsertUser = await prisma.user.upsert({
    where: {
      email: idTokenInfo.email
    },
    update: {},
    create: {
      email: idTokenInfo.email,
      firstName: idTokenInfo.name
    }
  })

  if (!upsertUser) {
    throw new Error("User not found and could not be created")
  }

  return upsertUser
}
