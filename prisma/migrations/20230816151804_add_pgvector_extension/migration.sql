-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "embedding" vector(1536);
