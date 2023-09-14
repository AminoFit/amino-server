import { prisma } from "./prisma"

export async function GetMessagesForUser(userId: string) {
  const messagesForUser = await prisma.message.findMany({
    where: {
      userId: userId
    },
    take: 10,
    orderBy: [
      {
        createdAt: "desc"
      }
    ]
  })
  return messagesForUser.reverse()
}
export async function GetMessageById(messageId: number) {
  const message = await prisma.message.findUnique({
    where: {
      id: messageId
    }
  })
  return message
}
