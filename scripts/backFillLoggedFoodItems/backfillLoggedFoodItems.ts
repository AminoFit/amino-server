import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { FoodItemToLog, LoggedFoodServing } from "@/utils/loggedFoodItemInterface";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";
import { calculateNutrientData } from "@/foodMessageProcessing/common/calculateNutrientData";
import { Tables } from "types/supabase";
import { updateFoodItems } from "scripts/updateFoodItemData/update";

// Total Batch Size
const TOTAL_BATCH_SIZE = 1000;

// Sub-Batch Size
const SUB_BATCH_SIZE = 100;

// Maximum FoodItemID to attempt nutrient refetch
const MAX_FOOD_ITEM_ID_FOR_UPDATE = 7500;

/**
 * Processes a sub-batch of logged food items by backfilling their nutrient data.
 * @param loggedFoodItems - Array of LoggedFoodItem records.
 * @param foodItems - Array of FoodItem records with Nutrients and Serving data.
 * @param supabase - Supabase admin client instance.
 */
async function processBatch(
    loggedFoodItems: Tables<"LoggedFoodItem">[],
    foodItems: (Tables<"FoodItem"> & FoodItemWithNutrientsAndServing)[],
    supabase: ReturnType<typeof createAdminSupabase>
) {
    for (const loggedFoodItem of loggedFoodItems) {
        if (loggedFoodItem.foodItemId === null) continue;

        const matchingFoodItem = foodItems.find(food => food.id === loggedFoodItem.foodItemId);

        if (!matchingFoodItem) {
            console.error(`No matching food item found for logged food item: ${loggedFoodItem.id}`);
            continue;
        }

        const foodItemToLog: FoodItemToLog = {
            food_database_search_name: matchingFoodItem.name,
            full_item_user_message_including_serving: "", // Provide an appropriate default value or adjust as needed
            branded: !!matchingFoodItem.brand,
            brand: matchingFoodItem.brand || "",
            serving: {
                total_serving_g_or_ml: loggedFoodItem.grams,
                serving_g_or_ml: matchingFoodItem.isLiquid ? 'ml' : 'g'
            } as LoggedFoodServing
        };

        const updatedNutrients = calculateNutrientData(foodItemToLog.serving!.total_serving_g_or_ml, matchingFoodItem);

        const { error: updateError } = await supabase
            .from("LoggedFoodItem")
            .update(updatedNutrients)
            .eq("id", loggedFoodItem.id);

        if (updateError) {
            console.error(`Error updating logged food item: ${loggedFoodItem.id}`, updateError);
            continue;
        }

        // Optional: Log success
        // console.log(`Successfully backfilled logged food item: ${loggedFoodItem.id}`);
    }
}

/**
 * Backfills logged food items for a specific user.
 * @param userID - The UUID of the user whose logged food items are to be backfilled.
 */
export async function backfillLoggedFoodItemsForUser(userID: string) {
    const supabase = createAdminSupabase();

    let lastConsumedOn: string | null = null;
    let processNextBatch = true;

    while (processNextBatch) {
        console.log(`Processing batch for user: ${userID}`);
        // Start building the query
        let query = supabase
            .from("LoggedFoodItem")
            .select("*")
            // .is("kcal", null)
            // .is("carbG", null)
            // .is("totalFatG", null)
            // .is("proteinG", null)
            .eq("userId", userID)
            .order("consumedOn", { ascending: false })
            .limit(TOTAL_BATCH_SIZE);

        // Conditionally add the 'lt' filter if lastConsumedOn is set
        if (lastConsumedOn) {
            query = query.lt("consumedOn", lastConsumedOn);
        }

        // Execute the query
        const { data: loggedFoodItems, error } = await query as { data: Tables<"LoggedFoodItem">[]; error: any };

        if (error) {
            console.error("Error 1: fetching logged food items:", error);
            return;
        }

        if (!loggedFoodItems || loggedFoodItems.length === 0) {
            console.log("Error 2: No more logged food items need backfilling for user:", userID);
            processNextBatch = false;
            continue;
        }

        console.log(`Found ${loggedFoodItems.length} logged food items for user: ${userID}`);

        // Update lastConsumedOn for pagination
        lastConsumedOn = loggedFoodItems[loggedFoodItems.length - 1].consumedOn;

        console.log("loggedFoodItems", JSON.stringify(loggedFoodItems, null, 2))

        const foodItemIds = Array.from(new Set(
            loggedFoodItems
                .map(item => item.foodItemId)
                .filter(id => id !== null) as number[]
        ));

        if (foodItemIds.length === 0) {
            console.log("Error 3: No valid foodItemIds to fetch for this batch.");
            continue;
        }

        // Fetch FoodItems with Nutrients and Serving data
        const { data: foodItems, error: foodFetchError } = await supabase
            .from("FoodItem")
            .select("*, Nutrient(*)")
            .in("id", foodItemIds);

        if (foodFetchError) {
            console.error("Error fetching food items:", foodFetchError);
            return;
        }

        if (!foodItems || foodItems.length === 0) {
            console.error("No matching food items found for the fetched foodItemIds.");
            processNextBatch = false;
            continue;
        }

        const foodItemsWithNutrientsAndServing = foodItems as (Tables<"FoodItem"> & FoodItemWithNutrientsAndServing)[];

        // Identify FoodItemIDs that need nutrient refetching
        const foodItemIdsToUpdate: number[] = [];

        for (const foodItem of foodItemsWithNutrientsAndServing) {
            const nutrientCount = foodItem.Nutrient ? foodItem.Nutrient.length : 0;
            if (nutrientCount < 2 && foodItem.id <= MAX_FOOD_ITEM_ID_FOR_UPDATE) {
                foodItemIdsToUpdate.push(foodItem.id);
            }
        }

        if (foodItemIdsToUpdate.length > 0) {
            console.log(`Updating ${foodItemIdsToUpdate.length} FoodItems for nutrient data...`);
            await updateFoodItems(foodItemIdsToUpdate);
            console.log(`Completed updating FoodItems: ${foodItemIdsToUpdate.join(", ")}`);

            // Refetch the updated FoodItems
            const { data: updatedFoodItems, error: updatedFoodFetchError } = await supabase
                .from("FoodItem")
                .select("*, Nutrient(*)")
                .in("id", foodItemIdsToUpdate);

            if (updatedFoodFetchError) {
                console.error("Error refetching updated food items:", updatedFoodFetchError);
                return;
            }

            if (updatedFoodItems && updatedFoodItems.length > 0) {
                // Replace the old food items with updated ones
                for (let i = 0; i < foodItemsWithNutrientsAndServing.length; i++) {
                    const original = foodItemsWithNutrientsAndServing[i];
                    const updated = updatedFoodItems.find(item => item.id === original.id);
                    if (updated) {
                        foodItemsWithNutrientsAndServing[i] = updated as Tables<"FoodItem"> & FoodItemWithNutrientsAndServing;
                    }
                }
            }
        }

        // Process the batch in sub-batches
        const subBatches: Promise<void>[] = [];
        for (let i = 0; i < loggedFoodItems.length; i += SUB_BATCH_SIZE) {
            const subBatch = loggedFoodItems.slice(i, i + SUB_BATCH_SIZE);
            subBatches.push(processBatch(subBatch, foodItemsWithNutrientsAndServing, supabase));
        }

        // Await all sub-batches concurrently
        await Promise.all(subBatches);

        console.log(`Processed batch up to consumedOn: ${lastConsumedOn}`);
    }

    console.log(`Completed backfilling logged food items for user: ${userID}`);
}

/**
 * Backfills all logged food items without user filtering.
 * This function can be invoked if needed.
 */
export async function backfillLoggedFoodItems() {
    const supabase = createAdminSupabase();

    let lastItemId = 0;
    let processNextBatch = true;

    while (processNextBatch) {
        const { data: loggedFoodItems, error } = await supabase
            .from("LoggedFoodItem")
            .select("*")
            .is("kcal", null)
            .is("carbG", null)
            .is("totalFatG", null)
            .is("proteinG", null)
            .order("consumedOn", { ascending: false })
            .gt("id", lastItemId)
            .limit(TOTAL_BATCH_SIZE);

        if (error) {
            console.error("Error fetching logged food items:", error);
            return;
        }

        if (!loggedFoodItems || loggedFoodItems.length === 0) {
            console.log("No more logged food items need backfilling.");
            processNextBatch = false;
            continue;
        }

        const foodItemIds = Array.from(new Set(
            loggedFoodItems
                .map(item => item.foodItemId)
                .filter(id => id !== null) as number[]
        ));

        if (foodItemIds.length === 0) {
            console.log("No valid foodItemIds to fetch");
            continue;
        }

        const { data: foodItems, error: foodFetchError } = await supabase
            .from("FoodItem")
            .select("*, Nutrient(*)")
            .in("id", foodItemIds);

        if (foodFetchError) {
            console.error("Error fetching food items:", foodFetchError);
            return;
        }

        if (!foodItems || foodItems.length === 0) {
            console.error("No matching food items found.");
            processNextBatch = false;
            continue;
        }

        const foodItemsWithNutrientsAndServing = foodItems as (Tables<"FoodItem"> & FoodItemWithNutrientsAndServing)[];

        const subBatches = [];
        for (let i = 0; i < loggedFoodItems.length; i += SUB_BATCH_SIZE) {
            const subBatch = loggedFoodItems.slice(i, i + SUB_BATCH_SIZE);
            subBatches.push(processBatch(subBatch, foodItemsWithNutrientsAndServing, supabase));
        }

        // Process all sub-batches concurrently
        await Promise.all(subBatches);

        // Update lastItemId for pagination
        lastItemId = loggedFoodItems[loggedFoodItems.length - 1].id;

        console.log(`Latest processed food item ID: ${lastItemId}`);
    }
}

// Example usage for backfilling a specific user
// Replace "6b005b82-88a5-457b-a1aa-60ecb1e90e21" with the actual user ID
// backfillLoggedFoodItemsForUser("6b005b82-88a5-457b-a1aa-60ecb1e90e21").catch(console.error);

// Uncomment the line below to backfill all users
// backfillLoggedFoodItems().catch(console.error);
