/*
  Warnings:

  - You are about to drop the column `placeholderName` on the `LoggedFoodItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LoggedFoodItem" DROP COLUMN "placeholderName",
ADD COLUMN     "extendedOpenAiData" JSONB;
