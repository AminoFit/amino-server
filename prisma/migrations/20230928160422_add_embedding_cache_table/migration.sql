-- AlterTable
ALTER TABLE "LoggedFoodItem" ADD COLUMN     "embeddingId" INTEGER;

-- CreateTable
CREATE TABLE "foodEmbeddingCache" (
    "id" SERIAL NOT NULL,
    "textToEmbed" TEXT NOT NULL,
    "adaEmbedding" vector(1536),
    "bgeBaseEmbedding" vector(768),

    CONSTRAINT "foodEmbeddingCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foodEmbeddingCache_textToEmbed_key" ON "foodEmbeddingCache"("textToEmbed");

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "foodEmbeddingCache"("id") ON DELETE SET NULL ON UPDATE CASCADE;
