import { LoggedFoodItem, User } from "@prisma/client";
import moment from "moment-timezone";

import _ from "underscore";

export function FoodTable({
  foods,
  user,
}: {
  foods: LoggedFoodItem[];
  user: User;
}) {
  // TODO Filter by day?

  const groups = _.chain(foods)
    .filter((food) => {
      const consumptionTime = moment(food.consumedOn).tz(user.tzIdentifier);
      const today = moment().tz(user.tzIdentifier);
      return consumptionTime.isSame(today, "day");
    })
    .groupBy((food) => {
      const consumptionTime = moment(food.consumedOn).tz(user.tzIdentifier);
      if (consumptionTime.hour() < 5 || consumptionTime.hour() > 22) {
        return "midnight snack";
      }
      if (consumptionTime.hour() < 11) {
        return "breakfast";
      }
      if (consumptionTime.hour() < 15) {
        return "lunch";
      }
      return "dinner";
    })
    .value();
  console.log("groups", groups);

  const foodGroups = ["breakfast", "lunch", "dinner", "midnight snack"];

  return (
    <table className="min-w-full divide-y divide-gray-300">
      <thead className="bg-gray-50">
        <tr>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
          >
            Time
          </th>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
          >
            Name
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Fat
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Carbohydrates
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Protein
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Calories
          </th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
            <span className="sr-only">Edit</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {foodGroups.map((foodGroup) => {
          if (!groups[foodGroup]) return null;
          return (
            <>
              <tr className="border-t border-gray-200 ">
                <th
                  colSpan={7}
                  scope="colgroup"
                  className="bg-gray-50 py-1 pl-4 pr-3 sm:pl-6 text-center text-xs font-bold text-gray-500"
                >
                  {foodGroup.toUpperCase()}
                </th>
              </tr>
              {groups[foodGroup].map((foodItem) => (
                <FoodRow foodItem={foodItem} user={user} key={foodItem.id} />
              ))}
            </>
          );
        })}
        <tr className="border-t border-gray-200 text-left bg-gray-50 ">
          <th className="px-4 py-3.5 text-sm font-semibold text-gray-900"></th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.fat, 0).toLocaleString()}g Fat
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.carbohydrates, 0).toLocaleString()}g
            Carbs
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.protein, 0).toLocaleString()}g Protein
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.calories, 0).toLocaleString()}g
            Calories
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"></th>
        </tr>
      </tbody>
    </table>
  );
}

export function FoodRow({
  foodItem,
  user,
}: {
  foodItem: LoggedFoodItem;
  user: User;
}) {
  return (
    <tr key={foodItem.id}>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">
        <div className="text-gray-700">
          {moment(foodItem.consumedOn).tz(user.tzIdentifier).format("h:mm a")}
        </div>
        <div className="text-xs">
          {moment(foodItem.consumedOn).tz(user.tzIdentifier).fromNow()}
        </div>
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
        <div className="text-xs font-light text-gray-500">
          {foodItem.amount} {foodItem.unit}
        </div>
        <div className="text-md font-medium text-gray-900 capitalize">
          {foodItem.name}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {foodItem.fat.toLocaleString()}g Fat
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {foodItem.carbohydrates.toLocaleString()}g Carb
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {foodItem.protein.toLocaleString()}g Protein
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {foodItem.calories.toLocaleString()} Calories
      </td>
      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
        <a href="#" className="text-indigo-600 hover:text-indigo-900">
          Edit<span className="sr-only">, {foodItem.name}</span>
        </a>
      </td>
    </tr>
  );
}
