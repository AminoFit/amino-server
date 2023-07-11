import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";
import { ChatMessage } from "../../../components/chat/ChatMessage";
import ChatBox from "../../../components/chat/ChatBox";

async function getMessages() {
  const session = await getServerSession(authOptions);

  if (session) {
    let userMessages = await prisma.message.findMany({
      where: {
        userId: session.user.userId,
      },
    });
    return userMessages.filter(
      (message) => message.role === "User" || message.role === "Assistant"
    );
  }
  return [];
}

export default async function Chat() {
  const messages = await getMessages();
  console.log("messages", messages);

  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Chat with Amino
        </h3>
      </div>
      <div className="px-4 py-5 sm:p-6 max-h-fit">
        <div className="flex flex-col h-full overflow-y-auto">
          {messages.map((message) => (
            <ChatMessage message={message} key={message.id} />
          ))}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-6">
        <ChatBox />
      </div>
    </div>
  );
}
