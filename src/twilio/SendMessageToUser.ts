import { Role, User } from "@prisma/client";
import { twilioClient } from "./twilio";

export default async function SendMessageToUser(
  user: User,
  body: string,
  from: string
) {
  console.log("SendMessageToUser phone", user.phone);
  console.log("SendMessageToUser body", body);
  console.log("SendMessageToUser from", from);
  const msg = await twilioClient.messages
    .create({
      body,
      from,
      to: user.phone,
    })
    .then((message: any) => {
      console.log(message.sid);
      return message;
    });
  return msg;
}
