-- CreateEnum
CREATE TYPE "FoodInfoSource" AS ENUM ('User', 'Online', 'GPT3', 'GPT4', 'LLAMA', 'LLAMA2');

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "foodInfoSource" "FoodInfoSource" NOT NULL DEFAULT 'User';
