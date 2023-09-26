-- CreateTable
CREATE TABLE "UsdaFoodItemEmbedding" (
    "id" SERIAL NOT NULL,
    "fdcId" INTEGER NOT NULL,
    "foodName" TEXT NOT NULL,
    "foodBrand" TEXT,
    "brandOwner" TEXT,
    "bgeLargeEmbedding" vector(1024),

    CONSTRAINT "UsdaFoodItemEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsdaFoodItemEmbedding_fdcId_key" ON "UsdaFoodItemEmbedding"("fdcId");

-- CreateIndex
CREATE INDEX "UsdaFoodItemEmbedding_bgeLargeEmbedding_idx"
ON "UsdaFoodItemEmbedding"
USING hnsw ("bgeLargeEmbedding" vector_l2_ops)
WITH (m = 4, ef_construction = 10);
