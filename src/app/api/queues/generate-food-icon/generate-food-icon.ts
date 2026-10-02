// Constants
export const MAX_DURATION = 300

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
import { SUPPLEMENT_FORMS, parseIconJob, supplementForm, type SupplementIconJob } from "./supplementIcon"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { chooseFoodIcon } from "./chooseFoodIcon"
import { isCurrentStyle } from "./iconStyle"

const BUCKET_NAME = "foodimages"

// Initialize Supabase client outside of the queue to avoid reinitializing it every time
const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Queue for generating food icons
// A job is a food's id, or a supplement's JSON (supplementIcon): supplements share one icon per form.
export const generateFoodIconQueue = Queue("api/queues/generate-food-icon", async (payload: string) => {
  const job = parseIconJob(payload)
  if (!job) throw new Error("Invalid icon job")
  await fillFoodIcon(job)
})

/** Gives a food its icon: a supplement's shared one, else an existing icon that looks the same (Jev), else a new
 * drawing. Nothing when it already has one in the current style; a food with only old-style icons gets a new one (the
 * newest image is the one shown). The queue's job, also run directly (a backfill). */
export async function fillFoodIcon(job: NonNullable<ReturnType<typeof parseIconJob>>) {
  const foodItemId = job.foodId

  // Retrieve the food item from the database
  const foodItem = await getFoodItem(foodItemId)
  if (!foodItem) throw new Error("No Food Item with that ID")

  if (foodItem.FoodItemImages.some(link => isCurrentStyle(link.foodImageId))) {
    console.log("food_icon_present", { foodItemId })
    return
  }
  await giveIcon(foodItem, job)
  // The app's on-device catalogue syncs foods by lastUpdated: a new icon reaches it only with a bump.
  const { error } = await supabase.from("FoodItem").update({ lastUpdated: new Date().toISOString() }).eq("id", foodItemId)
  if (error) console.error("food_icon_not_synced", { foodItemId, error: error.message })
}

async function giveIcon(foodItem: NonNullable<Awaited<ReturnType<typeof getFoodItem>>>,
  job: NonNullable<ReturnType<typeof parseIconJob>>) {
  const foodItemId = foodItem.id
  if (job.supplement) {
    await linkSupplementIcon(foodItemId, job.supplement)
    return
  }

  // The closest icons by name shortlist; Jev decides whether one shows this food (the closest name can be another
  // food: "mixed vegetables" for mixed mushrooms).
  const embeddingId = (await getCachedOrFetchEmbeddings("BGE_BASE", [foodItem.name]))[0].id
  const { data: candidates, error: candidatesError } = await supabase.rpc("food_icon_candidates", {
    p_embedding_cache_id: embeddingId,
    p_limit: 16
  })
  if (candidatesError) throw candidatesError
  const choice = await chooseFoodIcon(
    { name: foodItem.name, brand: foodItem.brand, category: foodItem.foodItemCategoryName,
      servingUnit: foodItem.Serving?.[0]?.servingName ?? null },
    candidates.filter(row => isCurrentStyle(row.food_image_id)).slice(0, 8).map(row => ({
      id: row.food_image_id, description: row.image_description, similarity: row.cosine_similarity
    }))
  )
  if (choice.kind === "reuse") {
    const { error: linkError } = await supabase.from("FoodItemImages")
      .insert([{ foodItemId, foodImageId: choice.imageId, similarity: choice.similarity }])
    if (linkError) throw linkError
    console.log("food_icon_reused", { foodItemId, foodImageId: choice.imageId, similarity: choice.similarity,
      confidence: choice.confidence })
    return
  }
  console.log("food_icon_generating", { foodItemId, reason: choice.reason })

  // The food, not its brand: brands add packaging and logos, and a generic icon suits the food's variants.
  const foodName = foodItem.name
  // Generate the icon and upload it to storage
  await generateAndUploadIcon(foodName, foodItem.id)

  console.log("Done generating food icon for:", foodItem.name)
}

/** Links the shared icon for the supplement's form, drawing it the first time any supplement of that form needs it. */
async function linkSupplementIcon(foodItemId: number, supplement: SupplementIconJob["supplement"]) {
  const form = await supplementForm(supplement.name, supplement.unit)
  const description = SUPPLEMENT_FORMS[form]
  const { data: shared, error } = await supabase.from("FoodImage").select("id").eq("imageDescription", description)
    .order("id").limit(1)
  if (error) throw error
  if (shared?.length) {
    const { error: linkError } = await supabase.from("FoodItemImages")
      .insert([{ foodItemId, foodImageId: shared[0].id, similarity: 1 }])
    if (linkError) throw linkError
    console.log("supplement_icon_reused", { foodItemId, form, foodImageId: shared[0].id })
    return
  }
  console.log("supplement_icon_generating", { foodItemId, form })
  await generateAndUploadIcon(description, foodItemId)
}

/** Queues a new food's icon: a supplement's shared one, or the usual reuse-or-draw. One job per food. */
export function enqueueFoodIcon(foodId: number, supplement?: SupplementIconJob["supplement"]) {
  const payload = supplement ? JSON.stringify({ foodId, supplement } satisfies SupplementIconJob) : String(foodId)
  return generateFoodIconQueue.enqueue(payload, { id: `icon-${foodId}` })
}

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
  const { data, error } = await supabase.from("FoodItem").select("*, FoodItemImages(*), Serving(servingName)").eq("id", foodId)
    .limit(1, { foreignTable: "Serving" }).single()

  if (error) {
    console.error(error)
    throw error
  }
  return data
}

// Generates an icon for the food item and uploads it to storage
/** Draws and stores an icon for a food. look optionally describes the real product (shape and colours, never text or
 * logos) so a branded item resembles what the user sees. */
export async function generateAndUploadIcon(foodName: string, foodId: number, look?: string) {
  const imageBuffer = await generateIcon(foodName, look)
  const foodImageId = await uploadImageAndGetId(foodName, foodId, imageBuffer)

  return foodImageId
}

/** One simple subject per icon: the food alone, so it suits the food's variants and category. */
export const iconPrompt = (foodName: string, look?: string) =>
  `Generate on a transparent background a square image of ${foodName}, used as an icon for a food logging app. ` +
  (look ? `The real product looks like this; use its shape and colours only: ${look} ` : "") +
  `Show only ${foodName} itself: no side dishes, sauces, dips, garnishes, drinks, utensils or other foods next to it. ` +
  `Show it the way it is bought or used, so the kind of food is obvious at a glance: shredded cheese as a loose pile ` +
  `of shreds, sliced deli meat as folded slices, oil in a bottle. Use a bowl or plate only for a dish that is served ` +
  `in one (soup, cereal, salad, a stew, yogurt); never put an ingredient in a bowl. A plain drink, oil, spread or powder ` +
  `that would look like others may show one small whole ingredient beside it (almonds for almond milk). Keep it simple so it stays useful ` +
  `for variants of this food and its category. Isometric view. 3D, simplistic, vibrant colours. A simple outline so ` +
  `it works in light and dark mode. No text, labels, logos or brand packaging: show a generic version of the food.`

// Icons go through OpenRouter's image endpoint like every other model call (same model, same transparent PNG).
const requestIcon = (apiKey: string, foodName: string, look?: string) => fetch("https://openrouter.ai/api/v1/images", {
  method:"POST",
  headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
  signal:AbortSignal.timeout(90000),
  body:JSON.stringify({
    model:IMAGE_MODEL,
    prompt:iconPrompt(foodName, look),
    n:1,size:"1024x1024",quality:"medium",background:"transparent",output_format:"png"
  })
})

// The image model returns PNG bytes with an alpha channel directly.
async function generateIcon(foodName: string, look?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) throw new Error("OpenRouter is not configured")
  // Bursts are rate-limited (429): wait and try again. Missing credits (402) will not recover by waiting.
  let response = await requestIcon(apiKey, foodName, look)
  for (let attempt = 1; response.status === 429 && attempt <= 3; attempt++) {
    await response.body?.cancel()
    await new Promise(resolve => setTimeout(resolve, 15000 * attempt))
    response = await requestIcon(apiKey, foodName, look)
  }
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
  const thumbnailPath = `public/thumbs/${imageName}.webp`

  // The full image is kept; the app shows a 256 px WebP (about 6 KB instead of about 800 KB).
  await uploadFile(filePath, imageBuffer, "image/png")
  await uploadFile(thumbnailPath, await iconThumbnail(imageBuffer), "image/webp")

  // Insert a record into the FoodImage table and return the ID
  return await insertFoodImageRecord(foodName, foodId, filePath, thumbnailPath)
}

/** The size the app displays icons at (up to 80 pt at 3x), as WebP with transparency. */
export const iconThumbnail = (image: Buffer) =>
  sharp(image).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer()

// Generates a unique name for the image using a hash
function generateImageName(foodName: string) {
  const datetime = new Date().toISOString()
  const rawString = `${datetime}${foodName}`
  const hash = createHash("sha256").update(rawString).digest("hex")
  // Storage keys must be ASCII-safe: "Lala 100 +Proteína 1% Grasa" becomes "Lala_100_Proteina_1_Grasa".
  const slug = foodName.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80)
  return hash.slice(0, 12) + "_" + slug
}

// Uploads a file to Supabase storage. Icon files never change (each name is unique), so devices and the CDN may keep
// them for a year.
async function uploadFile(filePath: string, fileBuffer: Buffer, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, fileBuffer, {
    contentType, cacheControl: "31536000"
  })

  if (error) throw error
}

// Inserts a record into the FoodImage table
async function insertFoodImageRecord(foodName: string, foodId: number, filePath: string, thumbnailPath: string) {
  // Get the embedding for the foodName
  const embedding = (await getCachedOrFetchEmbeddings("BGE_BASE", [foodName]))[0].embedding

  // Construct the URL for the uploaded image
  const imageUrl = `${SupabaseURL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`
  const thumbnailUrl = `${SupabaseURL}/storage/v1/object/public/${BUCKET_NAME}/${thumbnailPath}`

  // Insert the record into the FoodImage table
  const { data: createdFoodImage, error: createImageError } = await supabase
    .from("FoodImage")
    .insert([
      {
        pathToImage: thumbnailUrl,
        originalPath: imageUrl,
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
