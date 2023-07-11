import { LoggedFoodItem } from "@prisma/client";
import { CalGraph } from "./CalGraph";

export default function FoodStats({ foods }: { foods: LoggedFoodItem[] }) {
  const totalCalories = foods.reduce((a, b) => a + b.calories, 0);
  const totalCarbs = foods.reduce((a, b) => a + b.carbohydrates, 0);
  const totalFats = foods.reduce((a, b) => a + b.fat, 0);
  const totalProtein = foods.reduce((a, b) => a + b.protein, 0);
  const goalCalories = 3500;
  const goalFats = 250;
  const goalCarbs = 250;
  const goalProtein = 250;
  return (
    <div>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="overflow-hidden rounded-lg bg-white px-4 pt-5 shadow sm:px-6 sm:pt-6">
          <div className="text-lg font-bold text-pink-500">Daily Calories</div>
          <div className="text-sm text-gray-500">
            {totalCalories.toLocaleString("en-us")}/
            {goalCalories.toLocaleString("en-us")}
          </div>
          <CalGraph
            percentage={(totalCalories / goalCalories) * 100}
            color="#EC4899"
            label={"Calories"}
          />
        </div>
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="text-lg font-bold text-emerald-500">Daily Fats</div>
          <div className="text-sm text-gray-500">
            {totalFats.toLocaleString("en-us")}/
            {goalFats.toLocaleString("en-us")}
          </div>
          <CalGraph
            percentage={(totalFats / goalFats) * 100}
            color="#11B981"
            label={"Fats"}
          />
        </div>
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="text-lg font-bold text-sky-500">Daily Carbs</div>
          <div className="text-sm text-gray-500">
            {totalCarbs.toLocaleString("en-us")}/
            {goalCarbs.toLocaleString("en-us")}
          </div>
          <CalGraph
            percentage={(totalCarbs / goalCarbs) * 100}
            color="#0BA5E9"
            label={"Carbs"}
          />
        </div>
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
          <div className="text-lg font-bold text-purple-500">Daily Protein</div>
          <div className="text-sm text-gray-500">
            {totalProtein.toLocaleString("en-us")}/
            {goalProtein.toLocaleString("en-us")}
          </div>
          <CalGraph
            percentage={(totalProtein / goalProtein) * 100}
            color="#A755F7"
            label={"Protein"}
          />
        </div>
      </dl>
    </div>
  );
}
