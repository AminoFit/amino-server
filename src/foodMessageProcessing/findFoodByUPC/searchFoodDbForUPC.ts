// Utils
import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";

/**
 * Searches for a food item by UPC in the Supabase database.
 * @param upc The UPC code of the food item to search.
 * @returns A FoodItemWithNutrientsAndServing object if found, otherwise null.
 */
export async function searchFoodDbByUPC(upc: number): Promise<FoodItemWithNutrientsAndServing | null> {
    const supabaseAdmin = createAdminSupabase();

    try {
        const { data, error, count } = await supabaseAdmin
            .from('FoodItem')
            .select(`
                *,
                Nutrient(*),
                Serving(*)
            `, { count: 'exact' })
            .eq('UPC', upc)
            .single();

        if (error && error.message !== 'JSON object requested, multiple (or no) rows returned') {
            console.error('Error searching for food item by UPC:', error.message);
            return null;
        }

        if (count === 0) {
            return null;
        }

        return data;
    } catch (error) {
        console.error('Exception when searching for food item by UPC:', error);
        return null;
    }
}
