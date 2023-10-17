import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"
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
  const session = await getServerSession()
  console.log("getUserFromRequest", request)

  if (!session?.user || !session.user.email) {
    throw new Error("User Not Authenticated")
  }

  // Get or Create the user
  const aminoUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  })

  if (!aminoUser) {
    throw new Error("User not found")
  }

  return aminoUser
}
