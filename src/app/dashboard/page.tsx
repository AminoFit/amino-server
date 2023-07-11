
import { prisma } from "@/database/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/auth";
import { FoodLogHeader } from "./FoodLogHeader";
import { FoodTable } from "./FoodRow";

async function getFoods() {
  const session = await getServerSession(authOptions);

  if (session) {
    let userFoods = await prisma.loggedFoodItem.findMany({
      where: {
        userId: session.user.userId,
      },
    });
    return userFoods;
  }
  return [];
}

export default async function FoodLog() {
  const foods = await getFoods();
  console.log("foods", foods);

  return (
    <>
      <div className="lg:flex lg:items-center lg:justify-between mb-10">
        <FoodLogHeader foods={foods} />
      </div>
      <div>
        <div className="mx-auto">
          <h2 className="mx-auto max-w-2xl text-base font-semibold leading-6 text-gray-900 lg:mx-0 lg:max-w-none">
            Recent activity
          </h2>
        </div>
        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <FoodTable foods={foods} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
