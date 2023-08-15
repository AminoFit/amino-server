"use server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/database/prisma";
import { Prisma, LoggedFoodItem } from "@prisma/client";
import { getServerSession } from "next-auth";

type UpdateLoggedFoodItemData = Omit<Partial<LoggedFoodItem>, 'id' | 'createdAt' | 'updatedAt' | 'extendedOpenAiData'> & {
    extendedOpenAiData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  };

export async function updateLoggedFoodItem(id: number, foodData: Partial<LoggedFoodItem>) {
  const session = await getServerSession(authOptions);

  if (!session || typeof session.user.userId !== 'string') {
    throw new Error("Not authenticated");
  }

  // Retrieve the current logged food item to check ownership
  const existingFoodItem = await prisma.loggedFoodItem.findUnique({
    where: { id: id },
  });

  // Check if the food item belongs to the current user
  if (existingFoodItem?.userId !== session.user.userId) {
    throw new Error("Not authorized to edit this food item");
  }

  // Define the data object for updating
  const updateData: UpdateLoggedFoodItemData = {
    ...foodData,
    extendedOpenAiData: foodData.extendedOpenAiData as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
  };

  // If authorized, proceed to update the food item
  const updatedFoodItem = await prisma.loggedFoodItem.update({
    where: {
      id: id,
    },
    data: updateData,
  });
  return updatedFoodItem;
}
