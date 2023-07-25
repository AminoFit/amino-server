-- CreateEnum
CREATE TYPE "UnitPreference" AS ENUM ('IMPERIAL', 'METRIC');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Assistant', 'User', 'System', 'Function');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('Inbound', 'Outbound');

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "function_name" TEXT,
    "role" "Role" NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsAuthCode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SmsAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenAiUsage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelName" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "OpenAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "email" VARCHAR(255),
    "emailVerified" TIMESTAMP(3),
    "phone" VARCHAR(255),
    "dateOfBirth" TIMESTAMP(3),
    "weightKg" DOUBLE PRECISION,
    "heightCm" INTEGER,
    "calorieGoal" INTEGER,
    "proteinGoal" INTEGER,
    "carbsGoal" INTEGER,
    "fatGoal" INTEGER,
    "fitnessGoal" TEXT,
    "unitPreference" "UnitPreference" DEFAULT 'IMPERIAL',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "sentContact" BOOLEAN NOT NULL DEFAULT false,
    "tzIdentifier" TEXT NOT NULL DEFAULT 'America/New_York',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggedFoodItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foodItemId" INTEGER NOT NULL DEFAULT 0,
    "grams" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "servingId" INTEGER,
    "servingAmount" DOUBLE PRECISION,
    "loggedUnit" TEXT,
    "userId" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "LoggedFoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "brand" TEXT,
    "knownAs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "defaultServingSize" INTEGER NOT NULL DEFAULT 1,
    "defaultServingUnit" TEXT NOT NULL DEFAULT 'g',
    "defaultServingWeightGram" INTEGER,
    "kcalPerServing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFatPerServing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "satFatPerServing" DOUBLE PRECISION,
    "transFatPerServing" DOUBLE PRECISION,
    "carbPerServing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sugarPerServing" DOUBLE PRECISION,
    "addedSugarPerServing" DOUBLE PRECISION,
    "proteinPerServing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Serving" (
    "id" SERIAL NOT NULL,
    "servingWeightGram" DOUBLE PRECISION NOT NULL,
    "servingName" TEXT NOT NULL,
    "foodItemId" INTEGER NOT NULL,

    CONSTRAINT "Serving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nutrient" (
    "id" SERIAL NOT NULL,
    "nutrientName" TEXT NOT NULL,
    "nutrientUnit" TEXT NOT NULL,
    "nutrientAmountPerGram" DOUBLE PRECISION NOT NULL,
    "foodItemId" INTEGER NOT NULL,

    CONSTRAINT "Nutrient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsAuthCode_code_key" ON "SmsAuthCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SmsAuthCode" ADD CONSTRAINT "SmsAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OpenAiUsage" ADD CONSTRAINT "OpenAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "Serving"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Serving" ADD CONSTRAINT "Serving_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nutrient" ADD CONSTRAINT "Nutrient_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
