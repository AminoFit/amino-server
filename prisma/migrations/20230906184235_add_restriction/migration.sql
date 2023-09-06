/*
  Warnings:

  - A unique constraint covering the columns `[name,brand]` on the table `FoodItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_name_brand_key" ON "FoodItem"("name", "brand");
