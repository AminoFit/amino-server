/*
  Warnings:

  - A unique constraint covering the columns `[externalId,foodInfoSource]` on the table `FoodItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_externalId_foodInfoSource_key" ON "FoodItem"("externalId", "foodInfoSource");
