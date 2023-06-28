-- CreateTable
CREATE TABLE "OpenAiUsage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelName" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "OpenAiUsage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OpenAiUsage" ADD CONSTRAINT "OpenAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
