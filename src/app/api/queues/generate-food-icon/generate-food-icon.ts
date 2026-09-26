// Constants
export const MAX_DURATION = 300
// Reuse an existing icon only when its description is close to the food ("greek yogurt" for a yogurt
// drink scores ~0.83); weaker matches ("lasagna" for a milk, ~0.70) get a new icon instead.
const REUSE_SIMILARITY = 0.8

// Importing dependencies and initializing the Supabase client
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"
import { Queue } from "quirrel/next-app"
import { createHash } from "crypto"
import sharp from "sharp"

// Importing local utility functions
import { SupabaseURL, SupabaseServiceKey } from "@/utils/auth-keys"
import { IMAGE_MODEL } from "@/ai/models"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { vectorToSql } from "@/utils/pgvectorHelper"

const BUCKET_NAME = "foodimages"

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

  // Retrieve embedding ID for the food name
  const embeddingData = await getCachedOrFetchEmbeddings("BGE_BASE", [foodItem.name])
  const embeddingId = embeddingData[0].id

  // Call the Supabase function to get top similar images
  const { data: similarImages, error: similarityError } = await supabase.rpc("get_top_foodimage_embedding_similarity", {
    p_embedding_cache_id: embeddingId
  })

  if (similarityError) throw similarityError

  // Link the closest existing image when it is close enough
  if (similarImages.length > 0 && similarImages[0].cosine_similarity >= REUSE_SIMILARITY) {
    // Link the found image to the food item
    const { data: foodItemImages, error: errorFoodItemImages } = await supabase
      .from("FoodItemImages")
      .insert([
        {
          foodItemId: foodItemId,
          foodImageId: similarImages[0].food_image_id,
          similarity: similarImages[0].cosine_similarity
        }
      ])
      .select()
      .single()

    if (errorFoodItemImages) throw errorFoodItemImages

    console.log(`Linked existing FoodImage ${similarImages[0].food_image_id} to FoodItem ${foodItemId}`)
    return
  }

  // if there's a brand name we should append it to the food name
  const foodName = foodItem.brand ? `${foodItem.brand} ${foodItem.name}` : foodItem.name
  // Generate the icon and upload it to storage
  await generateAndUploadIcon(foodName, foodItem.id)

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
    await generateAndUploadIcon(foodItem.name, foodItem.id)

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
export async function generateAndUploadIcon(foodName: string, foodId: number) {
  const imageBuffer = await generateImageWithOpenAI(foodName)
  const foodImageId = await uploadImageAndGetId(foodName, foodId, imageBuffer)

  return foodImageId
}

// A current image model returns PNG bytes with an alpha channel directly.
async function generateImageWithOpenAI(foodName: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Image API key is not configured")
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
    signal:AbortSignal.timeout(90000),
    body:JSON.stringify({
      model:IMAGE_MODEL,
      prompt:`Create one clean, centered isometric food app icon of ${foodName}. Show only the food or its natural container. Every pixel outside the food silhouette must be fully transparent. Keep the silhouette crisp, with no ground, gradient, glow, bloom, vignette, drop shadow, reflection, text or border.`,
      n:1,size:"1024x1024",quality:"medium",background:"transparent",output_format:"png"
    })
  })
  if (!response.ok) {await response.body?.cancel();throw new Error(`Image generation failed (${response.status})`)}
  const result=await response.json()
  const encoded=result.data?.[0]?.b64_json
  if(typeof encoded!=="string"||!encoded.length)throw new Error("Image generation returned no PNG")
  const buffer=Buffer.from(encoded,"base64")
  if(buffer.length>12_000_000)throw new Error("Generated icon exceeds size limit")
  const metadata=await sharp(buffer).metadata()
  if(metadata.format!=="png"||!metadata.hasAlpha)throw new Error("Generated icon is not a transparent PNG")
  const alpha=(await sharp(buffer).stats()).channels[3]
  if(!alpha||alpha.min===255)throw new Error("Generated icon has no transparent pixels")
  return buffer
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
  // Storage keys must be ASCII-safe: "Lala 100 +Proteína 1% Grasa" becomes "Lala_100_Proteina_1_Grasa".
  const slug = foodName.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80)
  return hash.slice(0, 12) + "_" + slug
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
