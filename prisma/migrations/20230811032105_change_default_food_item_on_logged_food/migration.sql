-- DropForeignKey
ALTER TABLE "LoggedFoodItem" DROP CONSTRAINT "LoggedFoodItem_foodItemId_fkey";

-- AlterTable
ALTER TABLE "LoggedFoodItem" ALTER COLUMN "foodItemId" DROP NOT NULL,
ALTER COLUMN "foodItemId" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
