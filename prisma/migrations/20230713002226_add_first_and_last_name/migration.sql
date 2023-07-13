-- AlterTable
ALTER TABLE
  "User" RENAME COLUMN "name" TO "firstName";
ALTER TABLE
  "User"
ADD
  COLUMN "lastName" VARCHAR(255);