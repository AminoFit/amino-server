// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { Queue } from "quirrel/next-app"

import { SupabaseServiceKey, SupabaseURL } from "@/utils/auth-keys"
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"
import { openai } from "@/utils/openaiFunctionSchemas"
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import FormData from 'form-data';

const CLIPDROP_API_KEY = process.env.CLIPDROP_API_KEY


export const generateFoodIconQueue = Queue(
  "api/queues/generate-food-icon", // 👈 the route it's reachable on
  async (foodItemIdString: string) => {
    console.log("Enter api/queues/generate-food-icon with payload:", foodItemIdString)

    const foodItemId = parseInt(foodItemIdString)

    if (isNaN(foodItemId)) {
      throw new Error("Invalid foodItemId")
    }

    const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { error, data: foodItem } = await supabase.from("FoodItem").select("*").eq("id", foodItemId).single()

    if (error) {
      throw error
    }

    console.log("Food Item: ", foodItem)

    if (!foodItem) {
      throw new Error("No Food Item with that ID")
    }

    await GenerateIcon(foodItem.name, foodItem.id, supabase)

    // if (loggedFoodItem.status !== "Needs Processing") {
    //   throw new Error("Food does not need processing.")
    // }
    // if (!loggedFoodItem.User) {
    //   throw new Error("No user for food item")
    // }

    // const openAiData = loggedFoodItem?.extendedOpenAiData?.valueOf() as any

    // if (!openAiData) {
    //   throw new Error("No openAiData")
    // }
    // if (!openAiData.food_database_search_name) {
    //   throw new Error("No food_database_search_name")
    // }

    // if (loggedFoodItem.messageId) {
    //   await HandleLogFoodItem(
    //     loggedFoodItem,
    //     openAiData as FoodItemToLog,
    //     loggedFoodItem.messageId,
    //     loggedFoodItem.User
    //   )
    // } else {
    //   console.log("No messageId")
    // }

    console.log("Done generating food icon", foodItem.id, foodItem.name)

    return
  }
)

async function GenerateIcon(foodString: string, foodId: number, supabase: any) {
  const openAiResponse = await openai.images.generate({
    model: "dall-e-3",
    prompt: `A beautiful isometric vector 3D render of ${foodString}, presented as a single object in its most basic form, centered, with no surrounding elements, for use as an icon. White background.`,
    n: 1,
    size: "1024x1024"
  });

  console.log("OpenAI response", openAiResponse);

  const imageUrl = openAiResponse.data[0].url;

  const imageResponse = await fetch(imageUrl!);
  const imageBuffer = await imageResponse.buffer();

  const form = new FormData();
  form.append('image_file', imageBuffer, {
    filename: 'image.png',
    contentType: 'image/png',
  });

  const clipDropResponse = await fetch('https://clipdrop-api.co/remove-background/v1', {
    method: 'POST',
    headers: {
      'x-api-key': CLIPDROP_API_KEY!,
    },
    body: form,
  });

  if (!clipDropResponse.ok) {
    throw new Error('Error in removing background');
  }

  const processedImageBuffer = await clipDropResponse.buffer();

  // Construct file path with ID and food string
  const filePath = `public/${foodId}_${foodString}.png`; 
  await uploadFile(processedImageBuffer, filePath, supabase);

  console.log('Image uploaded to Supabase at', filePath);
}

async function uploadFile(fileBuffer: Buffer, filePath: string, supabase: any) {
  const { data, error } = await supabase.storage.from('foodimages').upload(filePath, fileBuffer, {
    contentType: 'image/png',
  });

  if (error) {
    throw new Error('Error uploading file to Supabase: ' + error.message);
  }

  console.log('File uploaded successfully', data);
}

async function testIconGeneration() {
  const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  await GenerateIcon("banana",123124,supabase)
}

//testIconGeneration()