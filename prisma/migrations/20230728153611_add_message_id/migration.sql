-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "messageId" INTEGER;

-- AlterTable
ALTER TABLE "LoggedFoodItem" ADD COLUMN     "messageId" INTEGER;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
