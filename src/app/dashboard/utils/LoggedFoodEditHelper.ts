"use server";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";
import { LoggedFoodItem } from "@prisma/client";

export async function updateLoggedFoodItem(id: number, foodData: Partial<LoggedFoodItem>) {
  const session = await getServerSession(authOptions);

  if (!session) {
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

  // If authorized, proceed to update the food item
  const updatedFoodItem = await prisma.loggedFoodItem.update({
    where: {
      id: id,
    },
    data: {
      ...foodData,
    },
  });
  return updatedFoodItem;
}
