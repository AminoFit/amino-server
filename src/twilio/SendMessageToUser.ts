import { Role, User } from "@prisma/client";
import { twilioClient } from "./twilio";
import { prisma } from "@/database/prisma";
import moment from "moment";
import SaveMessageFromUser from "@/database/SaveMessageFromUser";

const from = process.env.TWILIO_PHONE_NUMBER;

export async function SaveAndSendMessageToUser(user: User, message: string) {
  const savedMsg = await SaveMessageFromUser(user, message, Role.Assistant);
  const sentMsg = await SendMessageToUser(user, message);
  return sentMsg;
}

export async function SendMessageToUser(user: User, message: string) {
  const msg = await twilioClient.messages
    .create({
      body: message,
      from,
      to: user.phone,
    })
    .then((message: any) => {
      console.log(message.sid);
      return message;
    });
  return msg;
}

export async function SendDailyMacrosToUser(user: User) {
  const foodToday = await prisma.loggedFoodItem.aggregate({
    where: {
      userId: user.id,
      consumedOn: {
        gt: moment().startOf("day").toDate(),
        lt: moment().endOf("day").toDate(), // We can support historic days later on
      },
    },
    _sum: {
      calories: true,
      protein: true,
      carbohydrates: true,
      fat: true,
    },
  });

  let returnMessage = `No foods logged today.`;

  if (foodToday) {
    returnMessage = `Here are your macros for today:`;
    returnMessage += `\n\n${foodToday._sum.calories} calories`;
    returnMessage += `\n - ${foodToday._sum.fat}g Fat`;
    returnMessage += `\n - ${foodToday._sum.carbohydrates}g Carbs`;
    returnMessage += `\n - ${foodToday._sum.protein}g Protein`;
  }

  await SaveAndSendMessageToUser(user, returnMessage);
  return returnMessage;
}
