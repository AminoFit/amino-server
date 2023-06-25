/*
  Warnings:

  - You are about to drop the column `amoutn` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - Added the required column `amount` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoggedFoodItem" DROP COLUMN "amoutn",
ADD COLUMN     "amount" INTEGER NOT NULL;
