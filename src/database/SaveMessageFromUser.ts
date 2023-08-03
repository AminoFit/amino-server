import { User, Role, MessageType } from "@prisma/client";
import { prisma } from "./prisma";

export default async function SaveMessageFromUser(
  user: User,
  content: string,
  role: Role,
  functionName?: string,
  messageType?: MessageType
) {
  const newMessage = await prisma.message.create({
    data: {
      userId: user.id,
      content,
      role,
      function_name: functionName,
      messageType,
    },
  });
  return newMessage;
}
