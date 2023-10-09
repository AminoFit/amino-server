-- CreateTable
CREATE TABLE "UsdaFoodItemEmbedding" (
    "id" SERIAL NOT NULL,
    "fdcId" INTEGER NOT NULL,
    "foodName" TEXT NOT NULL,
    "foodBrand" TEXT,
    "brandOwner" TEXT,
    "bgeLargeEmbedding" vector(1024),
    "bgeBaseEmbedding" vector(768),
    CONSTRAINT "UsdaFoodItemEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsdaFoodItemEmbedding_fdcId_key" ON "UsdaFoodItemEmbedding"("fdcId");

-- CreateIndex
CREATE INDEX "UsdaFoodItemEmbedding_bgeBaseEmbedding_idx"
ON "UsdaFoodItemEmbedding"
USING hnsw ("bgeBaseEmbedding" vector_ip_ops) WITH (m = 16, ef_construction = 128);
