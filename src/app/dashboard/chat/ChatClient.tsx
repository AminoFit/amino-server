"use client";
import useSWR from "swr";
import { ChatMessage } from "../../../components/chat/ChatMessage";
import { Message } from "@prisma/client";
import ChatBox from "../../../components/chat/ChatBox";
import React from "react";

async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }
  return response.json();
}

export default function ChatClient() {
  const {
    data: messages,
    mutate,
    error,
  } = useSWR("/api/chat/getMessages", fetcher);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages]);

  if (error) return <div>Failed to load</div>;

  return (
    <div className="flex flex-col h-full justify-between border divide-y divide-gray-200 overflow-hidden">
      <div className="p-4">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Chat with Amino
        </h3>
      </div>
      <div className="overflow-y-auto grow flex flex-col p-4" ref={messagesEndRef}>
        {!messages ? (
          <div className="flex items-center justify-center h-full">
            Loading...
          </div>
        ) : (
          messages.map((message: Message) =>
            message.role === "User" || message.role === "Assistant" ? (
              <ChatMessage message={message} key={message.id} />
            ) : null
          )
        )}
      </div>
      <div className="sticky bottom-0 bg-white">
        <div className="p-4 bg-white">
          <ChatBox messages={messages} mutate={mutate} />
        </div>
      </div>
    </div>
  );
}
