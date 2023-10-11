-- AlterTable
ALTER TABLE "FoodItem" RENAME COLUMN "embedding" TO "adaEmbedding";
ALTER TABLE "FoodItem" ADD COLUMN "bgeBaseEmbedding" vector(768);
