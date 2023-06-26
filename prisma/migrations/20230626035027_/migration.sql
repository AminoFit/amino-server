-- CreateTable
CREATE TABLE "FoodDatabaseItem" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "abbreviated_product_name" TEXT,
    "generic_name" TEXT,
    "quantity" TEXT,
    "countries" TEXT,
    "serving_size" TEXT,
    "serving_quantity" TEXT,
    "product_quantity" TEXT,
    "image_url" TEXT,
    "energy_kcal_100g" TEXT,
    "energy_100g" TEXT,
    "fat_100g" TEXT,
    "saturated_fat_100g" TEXT,
    "carbohydrates_100g" TEXT,
    "sugars_100g" TEXT,
    "fiber_100g" TEXT,
    "proteins_100g" TEXT,
    "salt_100g" TEXT,
    "sodium_100g" TEXT,

    CONSTRAINT "FoodDatabaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodDatabaseItem_code_key" ON "FoodDatabaseItem"("code");
