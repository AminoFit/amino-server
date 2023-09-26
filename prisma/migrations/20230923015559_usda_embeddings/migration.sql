-- CreateTable
CREATE TABLE "UsdaFoodItemEmbedding" (
    "id" SERIAL NOT NULL,
    "fdcId" INTEGER NOT NULL,
    "foodName" TEXT NOT NULL,
    "foodBrand" TEXT,
    "brandOwner" TEXT,
    "bgeEmbedding" vector(768),

    CONSTRAINT "UsdaFoodItemEmbedding_pkey" PRIMARY KEY ("id")
);
