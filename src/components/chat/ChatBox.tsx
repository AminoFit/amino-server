"use client";

import { useState, useEffect, useRef } from "react";
import { sendMessage } from "./actions";
import { Message } from "@prisma/client";
import classNames from "classnames";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { ScopedMutator } from "swr/_internal";
import { mutate } from 'swr';

export default function ChatBox({messages, mutate}: {messages: Message[], mutate: ScopedMutator}) {
  const [messageInput, setMessageInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      const scrollHeight = textareaRef.current.scrollHeight + 2;
      textareaRef.current.style.height = scrollHeight + "px";
    }
  }, [messageInput]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessageInput("");
    setSubmitting(true);
  
    let newMessage: Message = {
      id: messages.length + 1,
      createdAt: new Date(),
      content: messageInput,
      function_name: null,
      role: 'User', 
      userId: 'pending',
      resolvedAt: null,
      status: 'RECEIVED', 
      messageType: 'CONVERSATION',
      itemsToProcess: 0,
      itemsProcessed: 0
    };    
  
    // Optimistically update the UI
    mutate((currentData: Message[]) => [...currentData, newMessage], false);
  
    try {
      const sentMessage = await sendMessage(messageInput);
      // Update the message id after it has been successfully sent
      // newMessage.id = sentMessage.id;
      mutate((currentData: Message[]) => currentData.map(
        (msg) => msg.id === 0 ? sentMessage : msg
      ));
    } catch (err) {
      // Handle the error
      setSubmitting(false);
    }
    setSubmitting(false);
  };  

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      // If shift is also pressed, add a new line
      e.preventDefault();
      setMessageInput((prevValue) => `${prevValue}\n`);
    } else if (e.key === "Enter") {
      // If only enter is pressed, submit the form
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent<HTMLFormElement>); // Cast KeyboardEvent to FormEvent
    }
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <div className="flex mt-2">
          <div className="grow">
            <textarea
              name="message"
              id="message"
              rows={1}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              ref={textareaRef}
              style={{
                resize: "vertical",
                overflow: "hidden",
                maxHeight: "30vh",
              }}
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="Log that I ate a banana"
            />
          </div>
          <div className="ms-3 flex items-center justify-end gap-x-6">
            <button
              type="submit"
              disabled={submitting}
              className={classNames(
                "rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
                { "opacity-50": submitting }
              )}
            >
              {submitting ? (
                "Sending..."
              ) : (
                <PaperAirplaneIcon className="h-6 w-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
