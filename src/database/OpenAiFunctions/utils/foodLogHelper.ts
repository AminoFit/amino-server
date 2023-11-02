import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase"

export function constructFoodItemRequestString(
  foodToLog: FoodItemToLog,
  foodInfoResponses: foodSearchResultsWithSimilarityAndEmbedding[]
): string {
  let foodItemRequestString = `We want to create food information for: ${foodToLog.food_database_search_name}`

  if (foodToLog.brand) {
    foodItemRequestString += ` - ${foodToLog.brand}`
  }

  // Use properties from LoggedFoodServing
  if (foodToLog.serving) {
    foodItemRequestString += ` Serving: ${foodToLog.serving.serving_name} (${foodToLog.serving.total_serving_g_or_ml}${foodToLog.serving.serving_g_or_ml})`
  }

  const top3Items = foodInfoResponses.slice(0, 3)
  if (top3Items.length > 0) {
    foodItemRequestString += `\nThe following food info is provided for context and may not be relevant`
  }

  for (const item of top3Items) {
    foodItemRequestString += `\n\n${item.foodName}`

    if (item.foodBrand) {
      foodItemRequestString += ` - ${item.foodBrand}`
    }

    if (item.foodItem) {
      // Adding default serving weight or ml before the macros
      if (item.foodItem.isLiquid && item.foodItem.defaultServingLiquidMl) {
        foodItemRequestString += ` Default Serving: ${item.foodItem.defaultServingLiquidMl}ml`
      } else if (item.foodItem.defaultServingWeightGram) {
        foodItemRequestString += ` Default Serving: ${item.foodItem.defaultServingWeightGram}g`
      }

      foodItemRequestString += ` Macros: ${item.foodItem.kcalPerServing} kcal, ${
        item.foodItem.totalFatPerServing
      }g fat, ${item.foodItem.satFatPerServing ?? 0}g sat fat, ${item.foodItem.transFatPerServing ?? 0}g trans fat, ${
        item.foodItem.carbPerServing
      }g carbs, ${item.foodItem.fiberPerServing ?? 0}g fiber, ${item.foodItem.sugarPerServing ?? 0}g sugar, ${
        item.foodItem.addedSugarPerServing ?? 0
      }g added sugar, ${item.foodItem.proteinPerServing}g protein`

      if (item.foodItem.Serving && item.foodItem.Serving.length > 0) {
        const servingsString = item.foodItem.Serving.slice(0, 3)
          .map((serving: Tables<"Serving">) => {
            let servingDetails = `${serving.servingName}`
            if (serving.servingWeightGram) {
              servingDetails += ` (${serving.servingWeightGram}g)`
            }
            if (serving.servingAlternateAmount && serving.servingAlternateUnit) {
              servingDetails += ` Alternate: ${serving.servingAlternateAmount}${serving.servingAlternateUnit}`
            }
            return servingDetails
          })
          .join(", ")
        foodItemRequestString += ` Other Servings: ${servingsString}`
      }
    }
  }
  return foodItemRequestString
}

// function testStringBuilder() {
//   const sampleFoodItem: FoodItemWithNutrientsAndServing = {
//     userId: "2341p9jf39n4",
//     id: 12345,
//     name: "Creamy Peanut Butter",
//     brand: "Nutty Delight",
//     knownAs: ["Peanut Spread", "Groundnut Butter"],
//     description: "A smooth and creamy peanut butter made from freshly ground peanuts.",
//     defaultServingWeightGram: 32,
//     defaultServingLiquidMl: null,
//     isLiquid: false,
//     weightUnknown: false,
//     kcalPerServing: 190,
//     totalFatPerServing: 16,
//     satFatPerServing: 3.5,
//     transFatPerServing: 0,
//     carbPerServing: 7,
//     fiberPerServing: 2,
//     sugarPerServing: 3,
//     addedSugarPerServing: 1,
//     proteinPerServing: 8,
//     lastUpdated: new Date().toISOString(),
//     verified: true,
//     externalId: "PBNUTTY01",
//     UPC: Number(123456789012),
//     Serving: [
//       {
//         id: 101,
//         servingWeightGram: 32,
//         servingAlternateAmount: null,
//         servingAlternateUnit: null,
//         servingName: "2 tablespoons",
//         foodItemId: 12345
//       },
//       {
//         id: 102,
//         servingWeightGram: 128,
//         servingAlternateAmount: null,
//         servingAlternateUnit: null,
//         servingName: "1 jar",
//         foodItemId: 12345
//       }
//     ],
//     Nutrient: [
//       {
//         id: 201,
//         nutrientName: "Iron",
//         nutrientUnit: "mg",
//         nutrientAmountPerDefaultServing: 0.6,
//         foodItemId: 12345
//       },
//       {
//         id: 202,
//         nutrientName: "Calcium",
//         nutrientUnit: "mg",
//         nutrientAmountPerDefaultServing: 15,
//         foodItemId: 12345
//       }
//     ],
//     foodInfoSource: "GPT4",
//     messageId: null
//   }
//   const foodSearchResultsWithSimilarityAndEmbedding: foodSearchResultsWithSimilarityAndEmbedding = {
//     foodBgeBaseEmbedding: [0.5, 0.2, 0.8, 0.1, 0.1],
//     similarityToQuery: 0.87,
//     foodSource: "GPT4",
//     foodName: "Creamy Peanut Butter",
//     foodBrand: "Nutty Delight",
//     externalId: "PBNUTTY01",
//     foodItem: sampleFoodItem
//   }
//   const sampleFoodItemToLog: FoodItemToLog = {
//     timeEaten: new Date().toISOString(),
//     food_database_search_name: "Creamy Peanut Butter",
//     branded: true,
//     brand: "Nutty Delight",
//     full_item_user_message_including_serving: "2 tablespoons of Creamy Peanut Butter",
//     serving: {
//       serving_amount: 1,
//       serving_name: "2 tablespoons",
//       serving_g_or_ml: "g",
//       total_serving_g_or_ml: 32
//     }
//   }
//   console.log(constructFoodItemRequestString(sampleFoodItemToLog, [foodSearchResultsWithSimilarityAndEmbedding]))
// }

//testStringBuilder()
