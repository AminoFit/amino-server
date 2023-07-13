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

export type UserSettingsProps = {
  tzIdentifier?: string;
  firstName?: string;
  lastName?: string;
};

export async function updateUserSettings(updatedSettings: UserSettingsProps) {
  const session = await getServerSession(authOptions);

  if (session) {
    let user = await prisma.user.update({
      where: {
        id: session.user.userId,
      },
      data: {
        ...updatedSettings,
      },
    });
    return user;
  }
  return;
}
