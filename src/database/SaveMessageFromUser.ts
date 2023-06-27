import { User, Role } from "@prisma/client";
import { prisma } from "./prisma";

export default async function SaveMessageFromUser(
  user: User,
  content: string,
  role: Role,
  functionName?: string
) {
  const newMessage = await prisma.message.create({
    data: {
      userId: user.id,
      content,
      role,
      function_name: functionName,
    },
  });
  return newMessage;
}
