-- CreateTable
CREATE TABLE "ApiCalls" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiName" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "ApiCalls_pkey" PRIMARY KEY ("id")
);
