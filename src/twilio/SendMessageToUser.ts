import { MessageDirection, MessageType, Role, User } from "@prisma/client"
import { twilioClient } from "./twilio"
import { prisma } from "@/database/prisma"
import { FoodItem, LoggedFoodItem } from "@prisma/client"
import moment from "moment-timezone"
import SaveMessageFromUser from "@/database/SaveMessageFromUser"
import { getNormalizedFoodValue } from "@/app/dashboard/utils/FoodHelper"

const from = process.env.TWILIO_PHONE_NUMBER

export async function SaveAndSendMessageToUser(user: User, message: string) {
  await SaveMessageFromUser(user, message, Role.Assistant, undefined, MessageType.ASSISTANT)
  const sentMsg = await SendMessageToUser(user, message)
  return sentMsg
}
export async function SaveMessageToUser(user: User, message: string) {
  return await SaveMessageFromUser(user, message, Role.Assistant)
}

export async function SendMessageToUser(user: User, message: string) {
  const msg = await twilioClient.messages
    .create({
      body: message,
      from,
      to: user.phone
    })
    .then((message: any) => {
      console.log(message.sid)
      return message
    })

  await LogSmsMessage(user, message, MessageDirection.Outbound)

  return msg
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
      direction: direction
    }
  })
}

export async function SendDailyMacrosToUser(user: User) {
  const foodToday = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gt: moment().startOf("day").toDate(),
        lt: moment().endOf("day").toDate()
      }
    },
    include: {
      FoodItem: {
        include: {
          Servings: true, // Include the Servings relation
        },
      },
    }
  })  

  let macrosToday = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }

  for (const food of foodToday) {
    macrosToday.calories += getNormalizedFoodValue(food, "kcalPerServing")
    macrosToday.protein += getNormalizedFoodValue(food, "proteinPerServing")
    macrosToday.carbohydrates += getNormalizedFoodValue(food, "carbPerServing")
    macrosToday.fat += getNormalizedFoodValue(food, "totalFatPerServing")
  }

  let returnMessage = `No foods logged today.`

  if (macrosToday.calories > 0) {
    returnMessage = `Here are your macros for today:`
    returnMessage += `\n\n${macrosToday.calories} calories`
    returnMessage += `\n - ${macrosToday.fat}g Fat`
    returnMessage += `\n - ${macrosToday.carbohydrates}g Carbs`
    returnMessage += `\n - ${macrosToday.protein}g Protein`
  }

  return returnMessage
}

export async function SendListOfFoodsTodayToUser(user: User) {
  const foodToday = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gt: moment().startOf("day").toDate(),
        lt: moment().endOf("day").toDate()
      }
    },
    include: {
      FoodItem: true
    },
    take: 100
  })

  if (foodToday && foodToday.length > 0) {
    let returnMessage = `Here's your list of food logged today:\n\n`

    for (const food of foodToday) {
      if (food.FoodItem) { // Check if FoodItem is not null
        returnMessage += `\n${food.FoodItem.name} - ${food.servingAmount} ${food.loggedUnit}`
      } else {
        // Handle the case where FoodItem is null, if needed
        returnMessage += `\nUnknown Food - ${food.servingAmount} ${food.loggedUnit}`
      }
    }
    return returnMessage
  }

  return `No foods logged today.`
}
