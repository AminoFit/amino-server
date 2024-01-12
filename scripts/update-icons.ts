import { SupabaseServiceKey, SupabaseURL } from "@/utils/auth-keys"
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"
import * as fs from "fs"
import * as path from "path"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { IconData } from "./IconData/icons"
import { UpdateBestIconForFoodItem } from "@/database/OpenAiFunctions/HandleLogFoodItems"

console.log("Syncing Food Icons from foodicons bucket")

// COUDRON: This was a script i used to generate a finite set of food icons. Might want to use a script like this to fix things later.


// const regex = /^icons8-([a-z-]+)-[\d-]+$/
// const BUCKET_NAME = "foodicons"

// type FoodIcon = {
//   filePath: string
//   name: string
// }

// // Initialize Supabase client outside of the queue to avoid reinitializing it every time
// const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
//   auth: {
//     autoRefreshToken: false,
//     persistSession: false
//   }
// })

// async function ClearBucket() {
//   const { data, error } = await supabase.storage.emptyBucket(BUCKET_NAME)
// }
// // async function ClearBucket() {
// //   const { data, error } = await supabase.storage.from(BUCKET_NAME).list()
// //   console.log("data", data)
// // }

// const LoadSvgIcons = async (folderPath: string) => {
//   const icons: FoodIcon[] = []
//   try {
//     const files = await fs.promises.readdir(folderPath)

//     for (const file of files) {
//       if (path.extname(file).toLowerCase() === ".svg") {
//         const fileName = path.basename(file, ".svg")
//         const match = fileName.match(regex)

//         if (match && match[1]) {
//           const stringMatch = match[1].replaceAll("-", " ")
//           console.log("Found", stringMatch)
//           icons.push({
//             filePath: path.join(folderPath, file),
//             name: stringMatch
//           })
//         } else {
//           // No match found or no group captured
//           console.log("No match found")
//           console.log("Path was: ", path.join(folderPath, file), ": ", path.basename(file, ".svg"))
//         }
//       }
//     }
//   } catch (error) {
//     console.error("Error reading folder:", error)
//   }
//   return icons
// }

// async function UploadIcon(icon: FoodIcon) {
//   const fileBuffer = fs.readFileSync(icon.filePath)
//   const fileName = path.basename(icon.filePath, ".svg")
//   const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, fileBuffer, {
//     contentType: "image/svg+xml"
//   })
//   if (error) {
//     console.error("Error uploading icon:", error)
//   }
//   console.log("Uploaded icon:", icon.name)
// }

// async function UploadIcons(icons: FoodIcon[]) {
//   for (const icon of icons) {
//     await UploadIcon(icon)
//   }
// }
// async function ClearFoodIconTable() {
//   await supabase.from("FoodIcon").delete().neq("id", -1)
// }
// async function StoreIconsInDatabase() {
//   await ClearFoodIconTable()

//   for (const style of IconData) {
//     for (const icon of style.icons) {
//       // Generate embedding
//       const embeddingData = await getCachedOrFetchEmbeddings("BGE_BASE", [icon.matchingString])

//       if (!embeddingData || embeddingData.length !== 1) {
//         console.error("No embedding data found for", icon.matchingString)
//         continue
//       }

//       // const fullUrl = `${SupabaseURL}/storage/v1/object/public/${BUCKET_NAME}/${path.basename(icon.filePath, ".svg")}`
//       // Insert into Icon into table
//       const { data: createdIcon, error: createIconImage } = await supabase
//         .from("FoodIcon")
//         .insert({
//           iconStyle: style.style,
//           fileName: icon.fileName,
//           matchingString: icon.matchingString,
//           bgeBaseEmbedding: JSON.stringify(embeddingData[0].embedding)
//         })
//         .select()
//       if (createIconImage) {
//         console.error("Error inserting icon:", createIconImage)
//         continue
//       }
//       console.log("Inserted icon:", icon.fileName)
//     }
//     console.log("Inserted icons into database")
//   }
// }

// async function UpdateAllFoodItems() {
//   const { data: foodItems, error: foodItemsError } = await supabase.from("FoodItem").select("*")
//   if (foodItemsError) {
//     console.error("Error fetching food items:", foodItemsError)
//     return
//   }
//   console.log("Found", foodItems.length, "food items")
//   for (const foodItem of foodItems) {
//     await UpdateBestIconForFoodItem(foodItem.id)
//   }
// }

// async function Run() {
//   // await ClearBucket()
//   // const icons = await LoadSvgIcons("./assets/foodicons")
//   // console.log("Found", icons, "icons")
//   // await UploadIcons(icons)
//   await StoreIconsInDatabase()
//   await UpdateAllFoodItems()
// }
// Run()
