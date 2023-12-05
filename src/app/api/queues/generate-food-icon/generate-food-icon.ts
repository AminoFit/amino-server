// Constants
export const MAX_DURATION = 300
const CLIPDROP_API_KEY = process.env.CLIPDROP_API_KEY

// Importing dependencies and initializing the Supabase client
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"
import { Queue } from "quirrel/next-app"
import { createHash } from "crypto"
import fetch from "node-fetch"
import FormData from "form-data"

// Importing local utility functions
import { SupabaseURL, SupabaseServiceKey } from "@/utils/auth-keys"
import { openai } from "@/utils/openaiFunctionSchemas"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { vectorToSql } from "@/utils/pgvectorHelper"

const BUCKET_NAME = "foodimages"
const COSINE_THRESHOLD = 0.75

// Initialize Supabase client outside of the queue to avoid reinitializing it every time
const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Queue for generating food icons
export const generateFoodIconQueue = Queue("api/queues/generate-food-icon", async (foodItemIdString: string) => {
  // Parse the food item ID and validate it
  const foodItemId = parseInt(foodItemIdString)
  if (isNaN(foodItemId)) throw new Error("Invalid foodItemId")

  // Retrieve the food item from the database
  const foodItem = await getFoodItem(foodItemId)
  if (!foodItem) throw new Error("No Food Item with that ID")

  // Check if food item already has an image
  if (foodItem?.FoodItemImages?.length > 0) {
    console.log(
      `Food item already has ${foodItem?.FoodItemImages?.length} image(s), skipping icon generation for:`,
      foodItem.name
    )
    return
  }

  // Check for an embedding that is close enough. If we find one, just add the link in the many-to-many table.
  // SEB. Please do this since Chris is bad at this shit.

  // Retrieve embedding ID for the food name
  const embeddingData = await getCachedOrFetchEmbeddings("BGE_BASE", [foodItem.name]);
  const embeddingId = embeddingData[0].id;

  // Call the Supabase function to get top similar images
  const { data: similarImages, error: similarityError } = await supabase.rpc('get_top_foodimage_embedding_similarity', { p_embedding_cache_id: embeddingId });

  if (similarityError) throw similarityError;

  // Check if any similar image is close enough
  const closeEnoughImage = similarImages.find(image => image.cosine_similarity >= COSINE_THRESHOLD);
  if (closeEnoughImage) {
    // Link the found image to the food item
    const { data: foodItemImages, error: errorFoodItemImages } = await supabase
      .from("FoodItemImages")
      .insert([
        {
          foodItemId: foodItemId,
          foodImageId: closeEnoughImage.food_image_id
        }
      ])
      .select()
      .single();

    if (errorFoodItemImages) throw errorFoodItemImages;

    console.log(`Linked existing FoodImage ${closeEnoughImage.food_image_id} to FoodItem ${foodItemId}`);
    return;
  }

  // Generate the icon and upload it to storage
  const foodImageId = await generateAndUploadIcon(foodItem.name, foodItem.id)

  console.log("Done generating food icon for:", foodItem.name)
})

// Queue for forcing the generation of a new food icons
export const forceGenerateNewFoodIconQueue = Queue(
  "api/queues/generate-food-icon-forced",
  async (foodItemIdString: string) => {
    // Parse the food item ID and validate it
    const foodItemId = parseInt(foodItemIdString)
    if (isNaN(foodItemId)) throw new Error("Invalid foodItemId")

    // Retrieve the food item from the database
    const foodItem = await getFoodItem(foodItemId)
    if (!foodItem) throw new Error("No Food Item with that ID")

    // Generate the icon and upload it to storage
    const foodImageId = await generateAndUploadIcon(foodItem.name, foodItem.id)

    console.log("Done generating food icon for:", foodItem.name)
  }
)

// Retrieves a single food item from the database by ID
async function getFoodItem(foodId: number) {
  const { data, error } = await supabase.from("FoodItem").select("*, FoodItemImages(*)").eq("id", foodId).single()

  if (error) {
    console.error(error)
    throw error
  }
  return data
}

// Generates an icon for the food item and uploads it to storage
async function generateAndUploadIcon(foodName: string, foodId: number) {
  // Generate the image using OpenAI's model
  const imageUrl = await generateImageWithOpenAI(foodName)

  // Download the image and process it with ClipDrop API
  const processedImageBuffer = await processImageWithClipDrop(imageUrl!)

  // Upload the processed image to Supabase storage and insert a record in the FoodImage table
  const foodImageId = await uploadImageAndGetId(foodName, foodId, processedImageBuffer)

  return foodImageId
}

// Generates an image using OpenAI's DALL-E model
async function generateImageWithOpenAI(foodName: string) {
  const openAiResponse = await openai.images.generate({
    model: "dall-e-3",
    prompt: `A beautiful isometric vector 3D render of a delicious ${foodName}, presented as a single object in its most basic form, centered, with no surrounding elements, for use as an icon. White background.`,
    n: 1,
    size: "1024x1024"
  })

  if (!openAiResponse) throw new Error("Error generating image with OpenAI")
  return openAiResponse.data[0].url
}

// Processes the image using the ClipDrop API to remove the background
async function processImageWithClipDrop(imageUrl: string) {
  const imageResponse = await fetch(imageUrl)
  const imageBuffer = await imageResponse.buffer()

  const form = new FormData()
  form.append("image_file", imageBuffer, {
    filename: "image.png",
    contentType: "image/png"
  })

  const clipDropResponse = await fetch("https://clipdrop-api.co/remove-background/v1", {
    method: "POST",
    headers: { "x-api-key": CLIPDROP_API_KEY! },
    body: form
  })

  if (!clipDropResponse.ok) throw new Error("Error in removing background")
  return await clipDropResponse.buffer()
}

// Uploads the image to Supabase storage and inserts a record into the FoodImage table
async function uploadImageAndGetId(foodName: string, foodId: number, imageBuffer: Buffer) {
  const imageName = generateImageName(foodName)
  const filePath = `public/${imageName}.png`

  // Upload the image to Supabase storage
  await uploadFile(filePath, imageBuffer)

  // Insert a record into the FoodImage table and return the ID
  return await insertFoodImageRecord(foodName, foodId, filePath)
}

// Generates a unique name for the image using a hash
function generateImageName(foodName: string) {
  const datetime = new Date().toISOString()
  const rawString = `${datetime}${foodName}`
  const hash = createHash("sha256").update(rawString).digest("hex")
  return hash.slice(0, 12) + "_" + foodName.replace(/\s/g, "_")
}

// Uploads a file to Supabase storage
async function uploadFile(filePath: string, fileBuffer: Buffer) {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, fileBuffer, {
    contentType: "image/png"
  })

  if (error) throw error
}

// Inserts a record into the FoodImage table
async function insertFoodImageRecord(foodName: string, foodId: number, filePath: string) {
  // Get the embedding for the foodName
  const embedding = (await getCachedOrFetchEmbeddings("BGE_BASE", [foodName]))[0].embedding

  // Construct the URL for the uploaded image
  const imageUrl = `${SupabaseURL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`

  // Insert the record into the FoodImage table
  const { data: createdFoodImage, error: createImageError } = await supabase
    .from("FoodImage")
    .insert([
      {
        pathToImage: imageUrl,
        bgeBaseEmbedding: vectorToSql(embedding),
        imageDescription: foodName
      }
    ])
    .select()
    .single()

  console.log("Inserted FoodImage record:", createdFoodImage)

  if (createImageError) throw createImageError

  const { data: foodItemImages, error: errorFoodItemImages } = await supabase
    .from("FoodItemImages")
    .insert([
      {
        foodItemId: foodId,
        foodImageId: createdFoodImage.id
      }
    ])
    .select()
    .single()

  console.log(`Linked FoodItem ${foodId} to FoodImage ${createdFoodImage.id}`)

  if (errorFoodItemImages) throw errorFoodItemImages
  return createdFoodImage.id
}

async function testIconGeneration() {
  const foodName = "banana"
  const foodId = 123124 // Example ID
  try {
    console.log(`Testing icon generation for: ${foodName}`)
    const foodImageId = await generateAndUploadIcon(foodName, foodId)
  } catch (error) {
    console.error("Error during test icon generation:", error)
  }
}

// test food icon queue generation
async function testFoodIconQueueGeneration() {
  await generateFoodIconQueue.enqueue(`2`)
  await generateFoodIconQueue.enqueue(`3`)
}

//testFoodIconQueueGeneration()
