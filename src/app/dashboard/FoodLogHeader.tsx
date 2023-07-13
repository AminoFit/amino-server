import { LoggedFoodItem, User } from "@prisma/client";

import {
  BriefcaseIcon,
  CalendarDaysIcon,
  CurrencyDollarIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import moment from "moment";
import FoodStats from "./FoodStats";

export function FoodLogHeader({
  foods,
  user,
}: {
  foods: LoggedFoodItem[];
  user: User;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex">
          <CalendarDaysIcon className="h-8 w-8 me-2" />
          <div>
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {moment().format("dddd, MMMM Do")}
            </h2>
            <div className="text-sm font-light text-gray-500 mb-4">
              Daily Food Overview
            </div>
          </div>
        </div>

        <div>
          <FoodStats foods={foods} user={user} />
        </div>
      </div>
    </>
  );
}
