-- CreateTable
CREATE TABLE "FoodImage" (
    "id" SERIAL NOT NULL,
    "pathToImage" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "foodItemId" INTEGER NOT NULL,

    CONSTRAINT "FoodImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FoodImage" ADD CONSTRAINT "FoodImage_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
