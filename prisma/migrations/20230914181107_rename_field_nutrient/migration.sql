/*
  Warnings:

  - You are about to drop the column `nutrientAmountPerGram` on the `Nutrient` table. All the data in the column will be lost.
  - Added the required column `nutrientAmountPerDefaultServing` to the `Nutrient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FoodInfoSource" ADD VALUE 'USDA';
ALTER TYPE "FoodInfoSource" ADD VALUE 'FATSECRET';
ALTER TYPE "FoodInfoSource" ADD VALUE 'NUTRITIONIX';

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "UPC" INTEGER,
ADD COLUMN     "defaultServingLiquidMl" DOUBLE PRECISION,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "fiberPerServing" DOUBLE PRECISION,
ADD COLUMN     "isLiquid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weightUnknown" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "defaultServingWeightGram" DROP NOT NULL;

-- AlterTable (rename field)
ALTER TABLE "Nutrient" RENAME COLUMN "nutrientAmountPerGram" TO "nutrientAmountPerDefaultServing";

-- AlterTable
ALTER TABLE "Serving" ADD COLUMN     "servingAlternateAmount" DOUBLE PRECISION,
ADD COLUMN     "servingAlternateUnit" TEXT,
ALTER COLUMN "servingWeightGram" DROP NOT NULL;
