import { User, Role } from "@prisma/client";
import { prisma } from "./prisma";

export default async function GetMessagesForUser(user: User) {
  const messagesForUser = await prisma.message.findMany({
    where: {
      userId: user.id,
    },
    take: 100,
  });
  return messagesForUser;
}
