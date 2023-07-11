"use server";

import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import ProcessMessage from "@/app/api/processMessage";
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";

export async function sendMessage(newMessage: string) {
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
