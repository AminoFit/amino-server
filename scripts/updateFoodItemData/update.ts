// scripts/updateFoodItems/updateFoodItems.ts

import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface";
import { Enums, Tables } from "types/supabase";

// Define the fields that are allowed to be updated
const allowedFoodItemFields: (keyof Tables<"FoodItem">)[] = [
    "name",
    "brand",
    "knownAs",
    "description",
    "defaultServingWeightGram",
    "defaultServingLiquidMl",
    "isLiquid",
    "kcalPerServing",
    "totalFatPerServing",
    "satFatPerServing",
    "transFatPerServing",
    "carbPerServing",
    "fiberPerServing",
    "sugarPerServing",
    "addedSugarPerServing",
    "proteinPerServing",
    "lastUpdated",
    "verified",
    "userId",
    "adaEmbedding",
    "UPC",
    "bgeBaseEmbedding",
    "foodInfoSource",
    "externalId",
    "messageId",
    "createdAtDateTime",
    "foodItemCategoryID",
    "foodItemCategoryName",
    "weightUnknown",
    // Add any other existing fields here
];

// Utility function to parse the bgeBaseEmbedding
function parseBgeBaseEmbedding(embedding: string | null): number[] {
    if (!embedding) return [];
    try {
        // Assuming the embedding is stored as a JSON string
        const parsed = JSON.parse(embedding);
        if (Array.isArray(parsed) && parsed.every(num => typeof num === 'number')) {
            return parsed;
        }
        // If it's a space-separated string
        if (typeof parsed === 'string') {
            return parsed.split(' ').map(Number).filter(num => !isNaN(num));
        }
    } catch (e) {
        console.error("Error parsing bgeBaseEmbedding:", e);
    }
    return [];
}

// Utility function to filter allowed fields and exclude null/undefined values
function filterAllowedFields<T extends Record<string, any>>(
    data: T,
    allowedFields: (keyof T)[]
): Partial<T> {
    const filtered: Partial<T> = {};
    for (const key of allowedFields) {
        if (key in data) {
            const value = data[key];
            if (value !== null && value !== undefined) {
                filtered[key] = value;
            }
        }
    }
    return filtered;
}

export async function updateFoodItems(foodItemIds: number[]) {
    const supabase = createAdminSupabase();

    for (const foodItemId of foodItemIds) {
        // Fetch the FoodItem from Supabase, including Nutrients and Servings
        const { data: foodItemData, error } = await supabase
            .from("FoodItem")
            .select("*, Nutrient(*), Serving(*)")
            .eq("id", foodItemId)
            .maybeSingle(); // To get a single record

        if (error || !foodItemData) {
            console.error(`Error fetching FoodItem with ID ${foodItemId}:`, error);
            continue;
        }

        const foodItem = foodItemData as FoodItemWithNutrientsAndServing;

        // Prepare the foodSearchResultsWithSimilarityAndEmbedding object
        const foodSearchResult: foodSearchResultsWithSimilarityAndEmbedding = {
            foodBgeBaseEmbedding: parseBgeBaseEmbedding(foodItem.bgeBaseEmbedding),
            similarityToQuery: 1.0,
            foodSource: foodItem.foodInfoSource as Enums<"FoodInfoSource">,
            foodName: foodItem.name,
            foodBrand: foodItem.brand || undefined,
            externalId: foodItem.externalId || undefined,
            foodItem: undefined, // We will fetch this
        };

        // Get the updated food info from the source
        let updatedFoodItem: FoodItemWithNutrientsAndServing | undefined;

        try {
            updatedFoodItem = await getCompleteFoodInfo(foodSearchResult);
        } catch (err) {
            console.error(`Error fetching updated info for FoodItem ID ${foodItemId}:`, err);
            continue;
        }

        if (!updatedFoodItem) {
            console.error(`No updated food info found for FoodItem ID ${foodItemId}`);
            continue;
        }

        // Now we can update the FoodItem's fields in Supabase

        // Prepare the updated fields by excluding Nutrient, Serving, and id
        const {
            Nutrient, // We'll handle Nutrient separately
            Serving,  // We'll handle Serving separately
            id,       // Do not update the ID
            ...rawUpdatedFields
        } = updatedFoodItem;

        // Convert Date to ISO string for lastUpdated
        rawUpdatedFields.lastUpdated = new Date().toISOString(); // Update the lastUpdated field

        // Filter the fields to include only allowed fields and exclude null/undefined
        const updatedFields = filterAllowedFields(rawUpdatedFields, allowedFoodItemFields as any);

        // Log updated fields for debugging
        console.log("Updating FoodItem with ID:", foodItemId);
        console.log("Updated fields:", updatedFields);

        // Update the FoodItem in Supabase
        const { error: updateError } = await supabase
            .from("FoodItem")
            .update(updatedFields)
            .eq("id", foodItemId);

        if (updateError) {
            console.error(`Error updating FoodItem with ID ${foodItemId}:`, updateError);
            continue;
        }

        // Handle Nutrients

        // Existing nutrients from the fetched FoodItem
        const existingNutrients = foodItem.Nutrient || [];

        console.log("Nutrient", JSON.stringify(Nutrient, null, 2))

        // Prepare a map of existing nutrients by nutrientName for quick lookup
        const existingNutrientMap = new Map<string, Tables<"Nutrient">>();
        for (const nutrient of existingNutrients) {
            existingNutrientMap.set(nutrient.nutrientName, nutrient);
        }

        // Update or insert nutrients from the updated data
        for (const updatedNutrient of Nutrient) {
            const existingNutrient = existingNutrientMap.get(updatedNutrient.nutrientName);

            if (existingNutrient) {
                // Update the nutrient
                const { error: nutrientUpdateError } = await supabase
                    .from("Nutrient")
                    .update({
                        nutrientUnit: updatedNutrient.nutrientUnit,
                        nutrientAmountPerDefaultServing: updatedNutrient.nutrientAmountPerDefaultServing,
                    })
                    .eq("id", existingNutrient.id);

                if (nutrientUpdateError) {
                    console.error(`Error updating Nutrient ID ${existingNutrient.id} for FoodItem ID ${foodItemId}:`, nutrientUpdateError);
                }
            } else {
                // Insert the nutrient
                const { error: nutrientInsertError } = await supabase
                    .from("Nutrient")
                    .insert({
                        nutrientName: updatedNutrient.nutrientName,
                        nutrientUnit: updatedNutrient.nutrientUnit,
                        nutrientAmountPerDefaultServing: updatedNutrient.nutrientAmountPerDefaultServing,
                        foodItemId: foodItemId,
                    });

                if (nutrientInsertError) {
                    console.error(`Error inserting Nutrient ${updatedNutrient.nutrientName} for FoodItem ID ${foodItemId}:`, nutrientInsertError);
                }
            }
        }

        // **Removed:** Code to delete existing nutrients not present in the updated data

        // Handle Servings

        // Existing servings from the fetched FoodItem
        const existingServings = foodItem.Serving || [];

        // Prepare a map of existing servings by servingName for quick lookup
        const existingServingMap = new Map<string, Tables<"Serving">>();
        for (const serving of existingServings) {
            existingServingMap.set(serving.servingName, serving);
        }

        // Update or insert servings from the updated data
        for (const updatedServing of Serving) {
            const existingServing = existingServingMap.get(updatedServing.servingName);

            if (existingServing) {
                // Update the serving
                const { error: servingUpdateError } = await supabase
                    .from("Serving")
                    .update({
                        servingWeightGram: updatedServing.servingWeightGram,
                        servingAlternateAmount: updatedServing.servingAlternateAmount,
                        servingAlternateUnit: updatedServing.servingAlternateUnit,
                        defaultServingAmount: updatedServing.defaultServingAmount,
                    })
                    .eq("id", existingServing.id);

                if (servingUpdateError) {
                    console.error(`Error updating Serving ID ${existingServing.id} for FoodItem ID ${foodItemId}:`, servingUpdateError);
                }
            } else {
                // Insert the serving
                const { error: servingInsertError } = await supabase
                    .from("Serving")
                    .insert({
                        servingWeightGram: updatedServing.servingWeightGram,
                        servingName: updatedServing.servingName,
                        foodItemId: foodItemId,
                        servingAlternateAmount: updatedServing.servingAlternateAmount,
                        servingAlternateUnit: updatedServing.servingAlternateUnit,
                        defaultServingAmount: updatedServing.defaultServingAmount,
                    });

                if (servingInsertError) {
                    console.error(`Error inserting Serving ${updatedServing.servingName} for FoodItem ID ${foodItemId}:`, servingInsertError);
                }
            }
        }

        console.log(`Successfully updated FoodItem ID ${foodItemId}`);
    }
}

// Example usage
const foodItemIdsToUpdate = [6];

// updateFoodItems(foodItemIdsToUpdate).catch(console.error);
