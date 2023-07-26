import { prisma } from "@/database/prisma"
import { SaveAndSendMessageToUser } from "@/twilio/SendMessageToUser"
import { User } from "@prisma/client"
import moment from "moment-timezone"
import { NextResponse } from "next/server"

export async function GET() {
  // Query all users who have no message in the past N time?

  const delaySinceLastMessage = 1000 * 60 // 60 seconds

  const users = await prisma.user.findMany({
    where: {
      Message: {
        none: {
          createdAt: {
            gt: new Date(Date.now() - delaySinceLastMessage)
          }
        }
      },
      sendCheckins: true
    }
  })

  // await Promise.all(users.map((user) => sendCheckinText(user)))

  //
  return NextResponse.json({ ok: true, users, now: Date.now() })
}

async function sendCheckinText(user: User) {
  const userTime = moment().tz(user.tzIdentifier)

  // Between 9am and 8pm local time for the user
  if (userTime.hour() > 9 && userTime.hour() < 20) {
    const message = `Hi there. Amino here. How are you doing? Any food you want to log?`

    return SaveAndSendMessageToUser(user, message)
  }
}
