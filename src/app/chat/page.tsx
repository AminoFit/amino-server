"use client";

import useSWR from "swr";
import React, { useState, useEffect, useRef } from "react";
import TimeAgo, { Formatter } from "react-timeago";
import "./ChatHistory.css"; // Make sure to create a corresponding CSS file
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { Message } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const buildFormatter =
  (intlStr: string): Formatter =>
  (value, unit, suffix, epochSeconds) => {
    if (unit === "second") return intlStr;
    return null;
  };

const ChatHistory: React.FC = () => {
  const [messageText, setMessageText] = useState("");
  const userId = "cljt2w6cz0000lzxgrzrlr3v0";
  const { data, error, mutate } = useSWR(
    `/api/chat/getMessages?userId=${userId}`,
    fetcher
  );
  const messages = React.useMemo(() => {
    return data
      ? data.sort(
          (a: Message, b: Message) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      : [];
  }, [data]);

  const endOfMessagesRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText) return;
    // TODO: Implement your sendMessage function here
    // After that, clean the input and refetch the messages
    setMessageText("");
    mutate();
  };

  if (error) return <div>Failed to load messages</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto p-3">
{messages.map((message: Message) => {	
          const messageDate = new Date(message.createdAt);	
          const now = new Date();	
          const timeDiff = now.getTime() - messageDate.getTime(); // in milliseconds	
          return (	
            <div	
              className={`chat-message ${	
                message.role === "User" ? "justify-end ml-auto" : "mr-auto"	
              }`}	
              key={message.id}	
            >	
              <div className="flex flex-col items-center">	
                <div className="text-center text-xs text-gray-500 mb-1">	
                  {timeDiff > 24 * 60 * 60 * 1000 ? (	
                    new Intl.DateTimeFormat("en-US", {	
                      weekday: "short",	
                      day: "numeric",	
                      month: "short",	
                      hour: "numeric",	
                      minute: "numeric",	
                      hour12: true,	
                    }).format(messageDate)	
                  ) : (	
                    <TimeAgo date={message.createdAt} />	
                  )}	
                </div>	
                <div	
                  className={`flex items-end ${	
                    message.role === "User" ? "justify-end" : "justify-start"	
                  }`}	
                >	
                  <div	
                    className={`flex flex-col space-y-2 text-xs max-w-4/5 mx-2 ${	
                      message.role === "User"	
                        ? "order-1 items-end"	
                        : "order-2 items-start"	
                    }`}	
                  >	
                    <div>	
                      <span	
                        className={`px-4 py-2 rounded-lg inline-block ${	
                          message.role === "User"	
                            ? "bg-blue-600 text-white rounded-br-none"	
                            : "bg-gray-300 text-gray-600 rounded-bl-none"	
                        }`}	
                      >	
                        {message.content.split("\n").map((item, key) => {	
                          return (	
                            <React.Fragment key={key}>	
                              {item}	
                              <br />	
                            </React.Fragment>	
                          );	
                        })}	
                      </span>	
                    </div>	
                  </div>	
                </div>	
              </div>	
            </div>	
          );	
        })}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="px-4 py-2 sm:px-6 flex-shrink-0 bg-white">
        <form
          onSubmit={sendMessage}
          className="mt-1 flex rounded-md shadow-sm"
        >
          <div className="relative flex items-stretch flex-grow focus-within:z-10">
            <input
              type="text"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300"
              placeholder="Type a message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-none rounded-r-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <PaperAirplaneIcon className="h-6 w-6 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
};
export default ChatHistory;
