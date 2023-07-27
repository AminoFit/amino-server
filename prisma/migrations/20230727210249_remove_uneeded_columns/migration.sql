/*
  Warnings:

  - You are about to drop the column `defaultServingSize` on the `FoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `defaultServingUnit` on the `FoodItem` table. All the data in the column will be lost.
  - Made the column `defaultServingWeightGram` on table `FoodItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "FoodItem" DROP COLUMN "defaultServingSize",
DROP COLUMN "defaultServingUnit",
ALTER COLUMN "defaultServingWeightGram" SET NOT NULL;
