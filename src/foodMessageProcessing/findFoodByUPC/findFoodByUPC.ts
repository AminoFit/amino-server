import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { searchFoodDbByUPC } from "./searchFoodDbForUPC"
import { getFoodItemExternalByUPC } from "@/FoodDbThirdPty/common/getFoodItemExternalByUPC"
import { addFoodItemToDatabase } from "../common/addFoodItemToDatabase"
import { Tables } from "types/supabase-generated.types"
import { getFoodEmbedding } from "@/utils/foodEmbedding"
import { isValidGTIN, removeGTINLeadingZerosToUpcOrGTIN13 } from "gtin-validator"
import { getUserByEmail } from "../common/debugHelper"

// Function to check if an integer is a valid GTIN
function isNumberValidGTIN(number: number): boolean {
  // Convert the number to a string
  let barcode = number.toString()

  // Determine the necessary padding to fit a GTIN format
  if (barcode.length > 14) {
    console.log("The number is too long to be a valid GTIN")
    return false
  }

  if (barcode.length < 8) {
    console.log("The number is too short to be a valid GTIN")
    return false
  }

  // Pad the string to the nearest valid GTIN length (8, 12, 13, or 14 digits)
  const validLengths = [8, 12, 13, 14]
  let paddedBarcode = barcode
  for (let len of validLengths) {
    if (barcode.length <= len) {
      paddedBarcode = barcode.padStart(len, "0")
      break
    }
  }

  // Validate the padded barcode
  try {
    return isValidGTIN(paddedBarcode)
  } catch (error) {
    console.error("Error validating GTIN:", error)
    return false
  }
}

export async function findFoodByUPC(
  upc: number,
  messageId: number,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing | null> {
  if (!isNumberValidGTIN(upc)) {
    console.log("Invalid UPC")
    return null
  }

  let foodItem = await searchFoodDbByUPC(upc)

  if (foodItem !== null) {
    return foodItem
  }

  foodItem = await getFoodItemExternalByUPC(upc.toString())

  if (foodItem !== null) {
    const embedding = await getFoodEmbedding(foodItem)
    const databaseFoodItem = await addFoodItemToDatabase(foodItem, embedding, messageId, user)
    return databaseFoodItem
  }

  return null
}


// async function testFindFoodByUPC() {
//   const upc = 99482412302
//   const messageId = 1
//   const user = await getUserByEmail ("seb.grubb@gmail.com")
//   const result = await findFoodByUPC(upc, messageId, user!)
//   console.log(result)
// }

// testFindFoodByUPC()