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
    return existingUser;
  }
  const upsertUser = await prisma.user.create({
    data: {
      phone,
    },
  });

  await SendVContactCardToUser(upsertUser);

  return upsertUser;
}

async function SendVContactCardToUser(user: User) {
  const msg = await twilioClient.messages
    .create({
      body: "Hello! Here is my contact card.",
      from,
      to: user.phone,
      mediaUrl: `https://ab5c7598fc4d-259316472161741218.ngrok-free.app/api/v-contact`,
    })
    .then((message: any) => {
      console.log(message.sid);
      return message;
    });
}
