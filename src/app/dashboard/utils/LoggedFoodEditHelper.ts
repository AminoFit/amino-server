"use server";
import { prisma } from "@/database/prisma";
import { getSession } from "@auth0/nextjs-auth0";
import { Prisma, LoggedFoodItem } from "@prisma/client";
import { getServerSession } from "next-auth";

type UpdateLoggedFoodItemData = Omit<Partial<LoggedFoodItem>, 'id' | 'createdAt' | 'updatedAt' | 'extendedOpenAiData'> & {
    extendedOpenAiData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  };

export async function updateLoggedFoodItem(id: number, foodData: Partial<LoggedFoodItem>) {
  const session = await getSession();

  let aminoUser = await prisma.user.findUnique({
    where: {
      email: session?.user.email
    }
  })

  if (!session || typeof session.user.userId !== 'string' || !aminoUser) {
    throw new Error("Not authenticated");
  }

  // Retrieve the current logged food item to check ownership
  const existingFoodItem = await prisma.loggedFoodItem.findUnique({
    where: { id: id },
  });

  // Check if the food item belongs to the current user
  if (existingFoodItem?.userId !== aminoUser.id) {
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
