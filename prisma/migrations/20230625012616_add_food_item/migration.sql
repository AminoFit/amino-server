-- CreateTable
CREATE TABLE "LoggedFoodItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "gramsProtein" INTEGER NOT NULL,
    "gramsCarbs" INTEGER NOT NULL,
    "gramsFats" INTEGER NOT NULL,
    "calories" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "LoggedFoodItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoggedFoodItem" ADD CONSTRAINT "LoggedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
