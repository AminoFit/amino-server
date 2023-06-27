import { User } from "@prisma/client";
import { prisma } from "../prisma";

export async function HandleLogExercise(user: User, parameters: any) {
  console.log("HandleLogExercise");
  console.log("parameters", parameters);

  return "I've logged your exercise.";

  // const foodItems = parameters.food_items;

  // let result = "I've logged your exercise:";

  // for (let food of foodItems) {
  //   console.log("foodItem", food);

  //   const data: any = {
  //     name: food.name,
  //     unit: food.unit,
  //     amount: food.amount,
  //     fat: food.fat,
  //     carbohydrates: food.carbohydrates,
  //     protein: food.protein,
  //     calories: food.calories,
  //     userId: user.id,
  //   };
  //   const foodItem = await prisma.loggedFoodItem
  //     .create({
  //       data,
  //     })
  //     .catch((err) => {
  //       console.log("Error logging food item", err);
  //     });
  //   if (!foodItem) {
  //     return;
  //   }
  //   result += `\n\n${foodItem.name}\n${foodItem.amount} ${foodItem.unit}\n${foodItem.calories} calories`;
  //   result += `\n - ${foodItem.fat}g Fat`;
  //   result += `\n - ${foodItem.carbohydrates}g Carbs`;
  //   result += `\n - ${foodItem.protein}g Protein`;
  // }
  // return result;
}
