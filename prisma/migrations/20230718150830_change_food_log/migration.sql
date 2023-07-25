-- AlterTable
ALTER TABLE "FoodItem" ALTER COLUMN "brand" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "LoggedFoodItem" ADD COLUMN     "servingId" INTEGER;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "Serving"("id") ON DELETE SET NULL ON UPDATE CASCADE;
