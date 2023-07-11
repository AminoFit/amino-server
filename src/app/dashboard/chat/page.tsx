import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";
import { ChatMessage } from "./ChatMessage";

async function getMessages() {
  const session = await getServerSession(authOptions);

  if (session) {
    let userMessages = await prisma.message.findMany({
      where: {
        userId: session.user.userId,
      },
    });
    return userMessages;
  }
  return [];
}

export default async function Chat() {
  const messages = await getMessages();
  console.log("messages", messages);

  return (
    <>
      <div className="messages flex-1 overflow-auto text-sm">
        {messages.map((message) => (
          <ChatMessage message={message} key={message.id} />
        ))}
      </div>
    </>
  );
}
