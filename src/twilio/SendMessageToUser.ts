import { MessageDirection, Role, User } from "@prisma/client";
import { twilioClient } from "./twilio";
import { prisma } from "@/database/prisma";
import { FoodItem, LoggedFoodItem } from "@prisma/client";
import moment from "moment-timezone";
import SaveMessageFromUser from "@/database/SaveMessageFromUser";

const from = process.env.TWILIO_PHONE_NUMBER;

type LoggedFoodItemWithFoodItem = LoggedFoodItem & { FoodItem: FoodItem }

function getNormalizedValue(
  LoggedFoodItem: LoggedFoodItemWithFoodItem,
  value: string
) {
  const nutrientPerServing =
    (LoggedFoodItem.FoodItem[
      value as keyof typeof LoggedFoodItem.FoodItem
    ] as number) || 0
  const gramsPerServing = LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
  const grams = LoggedFoodItem.grams || 1
  return (nutrientPerServing / gramsPerServing) * grams
}

export async function SaveAndSendMessageToUser(user: User, message: string) {
  await SaveMessageFromUser(user, message, Role.Assistant);
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

  await LogSmsMessage(user, message, MessageDirection.Outbound);

  return msg;
}

export async function LogSmsMessage(
  user: User,
  message: string,
  direction: MessageDirection
) {
  await prisma.smsMessage.create({
    data: {
      userId: user.id,
      content: message,
      direction: direction,
    },
  });
}

export async function SendDailyMacrosToUser(user: User) {
  const foodToday = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gt: moment().startOf("day").toDate(),
        lt: moment().endOf("day").toDate(),
      },
    },
    include: {
      FoodItem: true,
    },
  });

  let macrosToday = {calories: 0, protein: 0, carbohydrates: 0, fat: 0};

  for (const food of foodToday) {
    macrosToday.calories += getNormalizedValue(food, "kcalPerServing");
    macrosToday.protein += getNormalizedValue(food, "proteinPerServing");
    macrosToday.carbohydrates += getNormalizedValue(food, "carbPerServing");
    macrosToday.fat += getNormalizedValue(food, "totalFatPerServing");
  }

  let returnMessage = `No foods logged today.`;

  if (macrosToday.calories > 0) {
    returnMessage = `Here are your macros for today:`;
    returnMessage += `\n\n${macrosToday.calories} calories`;
    returnMessage += `\n - ${macrosToday.fat}g Fat`;
    returnMessage += `\n - ${macrosToday.carbohydrates}g Carbs`;
    returnMessage += `\n - ${macrosToday.protein}g Protein`;
  }

  return returnMessage;
}

export async function SendListOfFoodsTodayToUser(user: User) {
  const foodToday = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gt: moment().startOf("day").toDate(),
        lt: moment().endOf("day").toDate(),
      },
    },
    include: {
      FoodItem: true,
    },
    take: 100,
  });

  if (foodToday && foodToday.length > 0) {
    let returnMessage = `Here's your list of food logged today:\n\n`;

    for (const food of foodToday) {
      returnMessage += `\n${food.FoodItem.name} - ${food.servingAmount} ${food.loggedUnit}`;
    }
    return returnMessage;
  }

  return `No foods logged today.`;
}

