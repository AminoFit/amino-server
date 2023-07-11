import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import ProcessMessage from "@/app/api/processMessage";
import { prisma } from "@/database/prisma";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { getServerSession } from "next-auth";

export default function ChatBox() {
  async function sendMessage(data: FormData) {
    "use server";

    const newMessage = data.get("message") as string;
    if (!newMessage) return;

    console.log("newMessage", newMessage);

    const session = await getServerSession(authOptions);

    if (session) {
      let user = await prisma.user.findUnique({
        where: {
          id: session.user.userId,
        },
      });

      if (user) {
        await ProcessMessage(user, newMessage);
        console.log("message sent");
      }
    }
  }

  return (
    <div>
      <label
        htmlFor="message"
        className="block text-sm font-medium leading-6 text-gray-900"
      >
        Message Amino
      </label>
      <div className="flex mt-2">
        <form action={sendMessage}>
          <div className="grow">
            <input
              type="text"
              name="message"
              id="message"
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="Log that I ate a banana"
            />
          </div>
          <div className="ms-3 flex items-center justify-end gap-x-6">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
