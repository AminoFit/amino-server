import { LoggedFoodItem } from "@prisma/client";


import {
  BriefcaseIcon,
  CheckIcon,
  CurrencyDollarIcon,
  LinkIcon,
  MapPinIcon,
  PencilIcon
} from "@heroicons/react/20/solid";
import moment from "moment";
import { CalGraph } from "./CalGraph";
import FoodStats from "./FoodStats";

export function FoodLogHeader({ foods }: { foods: LoggedFoodItem[] }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
          Daily Food Overview{" "}
        </h2>
        <div className="text-sm font-light text-gray-500 mb-4">
          {moment().format("dddd, MMMM Do YYYY, h:mm:ss a")}
        </div>
        <div>
          <FoodStats foods={foods}/>
        </div>
        {/* <div className="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <BriefcaseIcon
              className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
              aria-hidden="true"
            />
            Total Calories Today: {foods.reduce((a, b) => a + b.calories, 0)}
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <MapPinIcon
              className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
              aria-hidden="true"
            />
            Total Fat Today: {foods.reduce((a, b) => a + b.fat, 0)}g
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <CurrencyDollarIcon
              className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
              aria-hidden="true"
            />
            Total Carbs Today: {foods.reduce((a, b) => a + b.carbohydrates, 0)}g
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <CurrencyDollarIcon
              className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
              aria-hidden="true"
            />
            Total Protein Today: {foods.reduce((a, b) => a + b.protein, 0)}g
          </div>
        </div> */}
      </div>
      
    </>
  );
}
