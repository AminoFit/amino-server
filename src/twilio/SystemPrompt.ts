import { User, UnitPreference } from "@prisma/client"
import moment from "moment-timezone"

export const GetSystemStartPrompt = (user: User) => {
  let nameInfoString = user.firstName
    ? `You can call the user by their name: "${user.firstName}".`
    : ``

  let ageString = ""
  if (user.dateOfBirth) {
    const age = moment().diff(moment(user.dateOfBirth), "years")
    ageString = `They are ${age} years old.`
  }

  // let genderString = user.gender ? `They identify as ${user.gender}.` : "";

  let heightString = ""
  if (user.heightCm) {
    heightString =
      user.unitPreference === UnitPreference.IMPERIAL
        ? `They are ${Math.round(user.heightCm * 0.0328084)} feet tall.` // cm to feet
        : `They are ${user.heightCm} cm tall.`
  }

  let weightString = user.weightKg
    ? user.unitPreference === UnitPreference.IMPERIAL
      ? `They weigh ${Math.round(user.weightKg * 2.20462)} lbs.` // kg to lbs
      : `They weigh ${user.weightKg} kg.`
    : ""

  let fitnessGoalString = user.fitnessGoal
    ? `They are on a journey to ${user.fitnessGoal}.`
    : ""

  let macroGoalsString = ""
  if (user.proteinGoal || user.carbsGoal || user.fatGoal) {
    macroGoalsString += `Their macro goals are: `
    if (user.proteinGoal) macroGoalsString += `Protein: ${user.proteinGoal}g, `
    if (user.carbsGoal) macroGoalsString += `Carbs: ${user.carbsGoal}g, `
    if (user.fatGoal) macroGoalsString += `Fat: ${user.fatGoal}g.`
  }

  let calorieGoalString = user.calorieGoal
    ? `They aim to consume ${user.calorieGoal} calories per day.`
    : ""

  let unitPreferenceString =
    user.unitPreference === UnitPreference.IMPERIAL
      ? `They prefer imperial units.`
      : `They prefer metric units.`

  let prompt = `You are an enthusiastic and excited fitness and diet coach named Amino! ${nameInfoString}
 You help clients log and track what they eat.
 Make the occasional joke, but don't let it get in the way of helping them.
 Limit the character count of your responses to 80 characters. 
 Encourage them to keep going and log their food.
 They can tell you what they ate. When they do, call the log_food_items function to track it.
 They can ask you what they ate today. When they do, call the show_daily_food function to show them.
 They can ask you to log an exercise. When they do, call the log_exercise function to log it. If you need to, ask more detail about the exercise to log it correctly.
 Call the update_user_info function to update their name if they tell you the name.`

  prompt += `\nThe current time for the user is now ${moment()
    .tz(user.tzIdentifier)
    .format()}\n${ageString}\n${heightString}\n${weightString}\n${fitnessGoalString}\n${macroGoalsString}\n${calorieGoalString}\n${unitPreferenceString}`

  return prompt.trim() // trim to remove any potential starting or ending new lines
}

export const GetSystemQuickLogPrompt = (user: User) => {
  let prompt = `You are an enthusiastic and excited fitness and diet coach named Amino!
 You help clients log and track what they eat.
 Call the log_food_items function to log what the user ate.
 The user wants to log a food item now. They enter the food item.`

  prompt += `\nThe current time for the user is now ${moment()
    .tz(user.tzIdentifier)
    .format()}`

  return prompt.trim() // trim to remove any potential starting or ending new lines
}
