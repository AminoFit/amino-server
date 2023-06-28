import { User } from "@prisma/client";
import { prisma } from "./prisma";
import { twilioClient } from "@/twilio/twilio";

const from = process.env.TWILIO_PHONE_NUMBER;

export default async function GetOrCreateUser(phone: string) {
  const existingUser = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (existingUser) {
    if (!existingUser.sentContact) {
      await SendVContactCardToUser(existingUser);
      await prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          sentContact: true,
        },
      });
    }
    return existingUser;
  }
  const upsertUser = await prisma.user.create({
    data: {
      phone,
      sentContact: true,
    },
  });
  await SendVContactCardToUser(upsertUser);

  return upsertUser;
}

async function SendVContactCardToUser(user: User) {
  const msg = await twilioClient.messages
    .create({
      body: "This is my contact card, in case you need to reach me.",
      from,
      to: user.phone,
      mediaUrl: `https://amino.fit/api/v-contact`,
    })
    .then((message: any) => {
      console.log(message.sid);
      return message;
    });
}
