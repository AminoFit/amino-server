import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { classifyFoodItemToCategory } from "@/foodMessageProcessing/classifyFoodItemInCategory/classifyFoodItemInCategory"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"


const misclassifiedItemIDs = [930]

async function main() {
	const user = await getUserByEmail("seb.grubb@gmail.com")
	let allFoodItemsCategorised = false
	const supabaseAdmin = createAdminSupabase()
	//select items that have no foodItemCategoryID or foodItemCategoryName
	do  {
	  const { data, error } = await supabaseAdmin
		.from("FoodItem")
		.select("*")
		// .eq("id", 413)
		.in("id", misclassifiedItemIDs)
		// .is("foodItemCategoryID", null)
		// .is("foodItemCategoryName", null)
		// .limit(3)
	  if (error) {
		console.error(error)
		return
	  }
	  if (!data || data.length === 0) {
		allFoodItemsCategorised = true
		break
	  }
	  const foodItems = data
	  // classify promises define
	  // define batch size
	  const batchSize = 10
	  for (let i = 0; i < foodItems.length; i += batchSize) {
		const batch = foodItems.slice(i, i + batchSize)
		// console.log("batch", batch[0].brand ? `${batch[0].name} - ${batch[0].brand}` : batch[0].name)
		const classifyPromises = batch.map(async (foodItem) => {
			console.log(`classifying ${foodItem.name} ${foodItem.brand ? `by ${foodItem.brand}` : ""}`)
		  return classifyFoodItemToCategory(foodItem as FoodItemWithNutrientsAndServing, user!)
		})
		// await Promise.all(classifyPromises)
		// write the results to the database
		for (const classifyPromise of classifyPromises) {
			
		  const { foodItemCategoryID, foodItemCategoryName, foodItemId } = await classifyPromise
		  console.log(`Food item id ${foodItemId} classified as ${foodItemCategoryName} with ID ${foodItemCategoryID}`)
		  const { data, error } = await supabaseAdmin
			.from("FoodItem")
			.update({ foodItemCategoryID, foodItemCategoryName })
			.eq("id", foodItemId)
			.single()
		  if (error) {
			console.error(error)
			return
		  }
		}
	  }
	  allFoodItemsCategorised = true
	} while (!allFoodItemsCategorised)
	console.log("Food items categorised")
  }

//   main()