"use server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";

export async function getUser() {
  const session = await getServerSession(authOptions);

  if (session) {
    let user = await prisma.user.findUnique({
      where: {
        id: session.user.userId,
      },
    });
    return user;
  }
  return;
}
export async function updateTimeZone(newTimeZone: string) {
  const session = await getServerSession(authOptions);

  if (session) {
    let user = await prisma.user.update({
      where: {
        id: session.user.userId,
      },
      data: {
        tzIdentifier: newTimeZone,
      },
    });
    return user;
  }
  return;
}
