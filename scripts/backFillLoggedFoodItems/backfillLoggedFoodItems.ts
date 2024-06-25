import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { FoodItemToLog, LoggedFoodServing } from "@/utils/loggedFoodItemInterface";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";
import { calculateNutrientData } from "@/foodMessageProcessing/common/calculateNutrientData";
import { Tables } from "types/supabase";

// Total Batch Size
const TOTAL_BATCH_SIZE = 10000;

// Sub-Batch Size
const SUB_BATCH_SIZE = 1000;

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

        // console.log(`Successfully backfilled logged food item: ${loggedFoodItem.id}`);
    }
}

async function backfillLoggedFoodItems() {
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
            .order("id", { ascending: true })
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

        const foodItemIds = loggedFoodItems
            .map(item => item.foodItemId)
            .filter(id => id !== null) as number[];

        if (foodItemIds.length > 0) {
            const { data: foodItems, error: foodFetchError } = await supabase
                .from("FoodItem")
                .select("*, Nutrient(*), Serving(*)")
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

        } else {
            console.log("No valid foodItemIds to fetch");
        }
    }
}

backfillLoggedFoodItems().catch(console.error);
