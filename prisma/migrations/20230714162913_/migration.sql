/*
  Warnings:

  - You are about to drop the column `amount` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `calories` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `carbohydrates` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `fat` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `protein` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `LoggedFoodItem` table. All the data in the column will be lost.
  - Added the required column `foodItemId` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `grams` to the `LoggedFoodItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoggedFoodItem" DROP COLUMN "amount",
DROP COLUMN "calories",
DROP COLUMN "carbohydrates",
DROP COLUMN "fat",
DROP COLUMN "name",
DROP COLUMN "protein",
DROP COLUMN "unit",
ADD COLUMN     "foodItemId" INTEGER NOT NULL,
ADD COLUMN     "grams" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "loggedUnit" TEXT,
ADD COLUMN     "servingAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "brand" VARCHAR(255),
    "knownAs" TEXT[],
    "description" TEXT,
    "defaultServingSize" INTEGER NOT NULL,
    "defaultServingUnit" TEXT NOT NULL,
    "defaultServingWeightGram" INTEGER,
    "kcalPerServing" DOUBLE PRECISION NOT NULL,
    "totalFatPerServing" DOUBLE PRECISION NOT NULL,
    "satFatPerServing" DOUBLE PRECISION,
    "transFatPerServing" DOUBLE PRECISION,
    "carbPerServing" DOUBLE PRECISION NOT NULL,
    "sugarPerServing" DOUBLE PRECISION,
    "addedSugarPerServing" DOUBLE PRECISION,
    "proteinPerServing" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Serving" (
    "id" SERIAL NOT NULL,
    "servingWeightGram" DOUBLE PRECISION NOT NULL,
    "servingName" TEXT NOT NULL,
    "foodItemId" INTEGER NOT NULL,

    CONSTRAINT "Serving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nutrient" (
    "id" SERIAL NOT NULL,
    "nutrientName" TEXT NOT NULL,
    "nutrientUnit" TEXT NOT NULL,
    "nutrientAmountPerGram" DOUBLE PRECISION NOT NULL,
    "foodItemId" INTEGER NOT NULL,

    CONSTRAINT "Nutrient_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Serving" ADD CONSTRAINT "Serving_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nutrient" ADD CONSTRAINT "Nutrient_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
