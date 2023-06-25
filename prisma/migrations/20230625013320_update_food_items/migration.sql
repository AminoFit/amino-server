/*
  Warnings:

  - You are about to drop the column `gramsCarbs` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `gramsFats` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `gramsProtein` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - Added the required column `amoutn` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `carbohydrates` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fat` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `protein` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoggedFoodItem" DROP COLUMN "gramsCarbs",
DROP COLUMN "gramsFats",
DROP COLUMN "gramsProtein",
ADD COLUMN     "amoutn" INTEGER NOT NULL,
ADD COLUMN     "carbohydrates" INTEGER NOT NULL,
ADD COLUMN     "fat" INTEGER NOT NULL,
ADD COLUMN     "protein" INTEGER NOT NULL,
ADD COLUMN     "unit" TEXT NOT NULL;
