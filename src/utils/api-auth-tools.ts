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

  const user = await prisma.user.findUnique({
    where: {
      email: idTokenInfo.email
    }
  })

  if (!user) {
    throw new Error("User not found")
  }

  return user
}
