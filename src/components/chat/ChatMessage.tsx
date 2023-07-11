"use client";

import { Message } from "@prisma/client";
import classNames from "classnames";
import moment from "moment";
import { Fragment } from "react";

export function ChatMessage({ message }: { message: Message }) {
  const messageDate = new Date(message.createdAt);
  const now = new Date();
  const timeDiff = now.getTime() - messageDate.getTime(); // in milliseconds
  return (
    <div
      className={`flex flex-fill ${
        message.role === "User" ? "justify-end" : ""
      }`}
      key={message.id}
    >
      <div>
        <div
          className={`space-y-2 text-xs max-w-4/5 mx-2 mb-3 ${
            message.role === "User"
              ? "order-1 items-end"
              : "order-2 items-start"
          }`}
        >
<span
  className={`px-4 py-2 rounded-lg inline-block ${
    message.role === "User"
      ? (message.userId === 'pending' ? "bg-blue-200 text-white rounded-br-none" : "bg-blue-600 text-white rounded-br-none")
      : "bg-gray-300 text-gray-600 rounded-bl-none"
  }`}
>
            {message.content.split("\n").map((item, key) => {
              return (
                <Fragment key={key}>
                  {item}
                  <br />
                </Fragment>
              );
            })}
          </span>
        </div>
        <div
  className={classNames("text-xs text-gray-400 mx-2 mb-1", {
    "text-right": message.role === "User",
  })}
  style={{ marginTop: '-10px' }}  // Adjust this value to your needs
>
          {message.userId === "pending"
            ? "Sending"
            : timeDiff > 24 * 60 * 60 * 1000
            ? new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "numeric",
                hour12: true,
              }).format(messageDate)
            : moment(message.createdAt).fromNow()}
        </div>
      </div>
    </div>
  );
}
