import { prisma } from "./prisma";

export default async function GetOrCreateUser(phone: string) {
  const upsertUser = await prisma.user.upsert({
    where: {
      phone,
    },
    update: {},
    create: {
      phone,
    },
  });
  return upsertUser;
}
