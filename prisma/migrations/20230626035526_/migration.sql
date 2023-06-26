/*
  Warnings:

  - You are about to drop the column `countries` on the `FoodDatabaseItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FoodDatabaseItem" DROP COLUMN "countries",
ADD COLUMN     "countries_en" TEXT;
