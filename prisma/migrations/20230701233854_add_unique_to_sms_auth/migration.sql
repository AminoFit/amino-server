/*
  Warnings:

  - You are about to alter the column `code` on the `SmsAuthCode` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(64)`.
  - A unique constraint covering the columns `[code]` on the table `SmsAuthCode` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SmsAuthCode" ALTER COLUMN "code" SET DATA TYPE VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "SmsAuthCode_code_key" ON "SmsAuthCode"("code");
