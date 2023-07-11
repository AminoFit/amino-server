import { LoggedFoodItem } from "@prisma/client";

export function FoodTable({ foods }: { foods: LoggedFoodItem[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-300">
      <thead className="bg-gray-50">
        <tr>
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
        <tr className="border-t border-gray-200 ">
          <th
            colSpan={6}
            scope="colgroup"
            className="bg-gray-50 py-1 pl-4 pr-3 sm:pl-6 text-left text-sm font-light text-gray-900"
          >
            Morning
          </th>
        </tr>
        {foods.map((foodItem) => (
          <FoodRow foodItem={foodItem} key={foodItem.id} />
        ))}
        <tr className="border-t border-gray-200 text-left bg-gray-50 ">
          <th className="px-4 py-3.5 text-sm font-semibold text-gray-900"></th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.fat, 0).toLocaleString()}g Fat
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.carbohydrates, 0).toLocaleString()}g Carbs
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.protein, 0).toLocaleString()}g Protein
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foods.reduce((a, b) => a + b.calories, 0).toLocaleString()}g Calories
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"></th>
        </tr>
      </tbody>
    </table>
  );
}

export function FoodRow({ foodItem }: { foodItem: LoggedFoodItem }) {
  return (
    <tr key={foodItem.name}>
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
