import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";
import { evaluate as mathEvaluate } from "mathjs";

// Create a Supabase client using the provided function
const supabaseAdmin = createAdminSupabase();

// Function to safely evaluate values
function safeEvaluate(value: number | string | null): number | null {
  if (value === null) return null;
  try {
    return mathEvaluate(value.toString());
  } catch {
    return null;
  }
}

// Function to calculate calories without fiber consideration
function calculateCaloriesWithoutFiber(
  fat: number | null,
  carbs: number | null,
  protein: number | null
): number {
  return (
    (fat ?? 0) * 9 +
    (carbs ?? 0) * 4 +
    (protein ?? 0) * 4
  );
}

// Function to check if the calorie count is consistent
function checkCalorieConsistency(foodItem: FoodItemWithNutrientsAndServing): { passes: boolean, details: string } {
  const expectedCalories = calculateCaloriesWithoutFiber(
    foodItem.totalFatPerServing,
    foodItem.carbPerServing,
    foodItem.proteinPerServing
  );

  const discrepancy = Math.abs(expectedCalories - foodItem.kcalPerServing);
  const percentageDiscrepancy = (discrepancy / expectedCalories) * 100;

  const passes = (discrepancy < 10) || (percentageDiscrepancy < 10);

  let reason = '';
  if (!passes) {
    if (foodItem.kcalPerServing < expectedCalories) {
      reason = 'Calories are too low based on the macros';
    } else {
      reason = 'Calories are too high based on the macros';
    }
  }

  return {
    passes,
    details: passes ? '' : `${reason}. Expected: ${expectedCalories}, Found: ${foodItem.kcalPerServing}, Discrepancy: ${discrepancy}, Percentage Discrepancy: ${percentageDiscrepancy.toFixed(2)}%`
  };
}

// Function to perform the sniff test
function sniffTest(foodItem: FoodItemWithNutrientsAndServing): { passes: boolean, details: string[] } {
  const calorieCheck = checkCalorieConsistency(foodItem);

  const details = [
    `Weight: ${foodItem.defaultServingWeightGram}g`,
    `Calories: ${foodItem.kcalPerServing}kcal`,
    `Carbs: ${foodItem.carbPerServing}g`,
    `Fat: ${foodItem.totalFatPerServing}g`,
    `Protein: ${foodItem.proteinPerServing}g`
  ];

  return { passes: calorieCheck.passes, details: calorieCheck.passes ? details : [calorieCheck.details, ...details] };
}

// Main function to check all food items
async function checkAllFoodItems() {
  const { data, error } = await supabaseAdmin
    .from('FoodItem')
    .select('*');

  if (error) {
    console.error('Error fetching food items:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No food items found.');
    return;
  }

  const foodItems = data.map(item => ({
    ...item,
    defaultServingWeightGram: safeEvaluate(item.defaultServingWeightGram),
    kcalPerServing: safeEvaluate(item.kcalPerServing)!,
    totalFatPerServing: safeEvaluate(item.totalFatPerServing)!,
    satFatPerServing: safeEvaluate(item.satFatPerServing),
    transFatPerServing: safeEvaluate(item.transFatPerServing),
    carbPerServing: safeEvaluate(item.carbPerServing)!,
    sugarPerServing: safeEvaluate(item.sugarPerServing),
    addedSugarPerServing: safeEvaluate(item.addedSugarPerServing),
    proteinPerServing: safeEvaluate(item.proteinPerServing)!,
    fiberPerServing: safeEvaluate(item.fiberPerServing),
    defaultServingLiquidMl: safeEvaluate(item.defaultServingLiquidMl),
  })) as FoodItemWithNutrientsAndServing[];

  const results = foodItems.map(foodItem => {
    const result = sniffTest(foodItem);
    return { foodItem, result };
  });

  results.forEach(({ foodItem, result }) => {
    if (result.passes) {
      //   console.log(`Food item ${foodItem.name} (${foodItem.brand}): Passes the sniff test`);
    } else {
      console.log(`Food item ${foodItem.name} (${foodItem.brand}): Fails the sniff test`);
      console.log('Reasons:', result.details);
    }
  });
}

checkAllFoodItems();
