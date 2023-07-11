"use client";

import { useState } from "react";
import { sendMessage } from "./actions";
import classNames from "classnames";

export default function ChatBox() {
  const [messageInput, setMessageInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    await sendMessage(messageInput).catch((err) => {
      setSubmitting(false);
    });
    setMessageInput("");
    setSubmitting(false);
  };

  return (
    <div>
      <label
        htmlFor="message"
        className="block text-sm font-medium leading-6 text-gray-900"
      >
        Message Amino
      </label>
      <form onSubmit={onSubmit}>
        <div className="flex mt-2">
          <div className="grow">
            <input
              type="text"
              name="message"
              id="message"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
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
              {submitting ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
