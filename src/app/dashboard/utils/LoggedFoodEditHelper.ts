"use server"

import { Tables } from "types/supabase"

// type UpdateLoggedFoodItemData = Omit<
//   Partial<Tables<"LoggedFoodItem">>,
//   "id" | "createdAt" | "updatedAt" | "extendedOpenAiData"
// > & {
//   extendedOpenAiData?: Pris.InputJsonValue | Pris.NullableJsonNullValueInput
// }

export async function updateLoggedFoodItem(id: number, foodData: Partial<Tables<"LoggedFoodItem">>) {
  alert("updateLoggedFoodItem")
  // const session = await getServerSession(authOptions)
  // if (!session?.user?.email) {
  //   throw new Error("Not authenticated")
  // }
  // let aminoUser = await prism.user.findUnique({
  //   where: {
  //     email: session?.user.email
  //   }
  // })
  // if (!aminoUser) {
  //   throw new Error("No user found")
  // }
  // // Retrieve the current logged food item to check ownership
  // const existingFoodItem = await prism.loggedFoodItem.findUnique({
  //   where: { id: id }
  // })
  // // Check if the food item belongs to the current user
  // if (existingFoodItem?.userId !== aminoUser.id) {
  //   throw new Error("Not authorized to edit this food item")
  // }
  // // Define the data object for updating
  // const updateData: UpdateLoggedFoodItemData = {
  //   ...foodData,
  //   extendedOpenAiData: foodData.extendedOpenAiData as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
  // }
  // // If authorized, proceed to update the food item
  // const updatedFoodItem = await prism.loggedFoodItem.update({
  //   where: {
  //     id: id
  //   },
  //   data: updateData
  // })
  // return updatedFoodItem
}
