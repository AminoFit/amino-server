import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodCompletion } from "@/foodResolution/model"
import { logFoodItemStream, parseFoodExtraction } from "../logFoodItemExtract/logFoodItemStreamChat"
import { fetchRotateAndConvertToBase64 } from "../common/imageTools/rotateImageFromUrl"
import { fetchAndDecodeBarcode } from "./utils/barcodeExtract"
import { image_system_prompt, food_logging_prompt } from "./visionPrompt"
import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import type { Tables } from "types/supabase"

async function signedImages(messageId:number):Promise<string[]>{
  const supabase=createAdminSupabase()
  const {data,error}=await supabase.from("UserMessageImages").select("imagePath").eq("messageId",messageId)
  if(error)throw error
  const urls=await Promise.all((data??[]).map(async image=>{
    const result=await supabase.storage.from("userUploadedImages").createSignedUrl(image.imagePath,3600)
    return result.error?null:result.data.signedUrl
  }))
  return urls.filter((url):url is string=>Boolean(url))
}

export async function logFoodItemStreamWithImages(
  user:Tables<"User">,message:Tables<"Message">,consumedOn:Date=new Date()
):Promise<{foodItemsToLog:FoodItemToLog[];isBadFoodLogRequest:boolean}>{
  const urls=await signedImages(message.id)
  if(!urls.length)return logFoodItemStream(user,message,consumedOn)
  const barcodes=await Promise.all(urls.map(async (url,index)=>{
    try{return (await fetchAndDecodeBarcode(url)).map(value=>
      `Image ${index+1}: barcode ${value.barcode} (${value.type}) in ${value.quadrant}`).join("\n")}
    catch{return ""}
  }))
  const prompt=food_logging_prompt.replace("USER_INPUT_CONTENT",message.content)+
    (barcodes.some(Boolean)?`\n${barcodes.filter(Boolean).join("\n")}`:"")
  const request=async (imageUrls:string[])=>parseFoodExtraction(await foodCompletion({
    systemPrompt:image_system_prompt,userMessage:prompt,imageUrls,max_tokens:8192
  },user),consumedOn)

  const first=await request(urls)
  if(first.foodItemsToLog.length&&!first.isBadFoodLogRequest)return first
  // Preserve the existing rotated-image recovery for incorrectly oriented photos.
  const rotated=await Promise.all(urls.map(async url=>{
    const data=await fetchRotateAndConvertToBase64(url)
    return data?`data:image/jpeg;base64,${data}`:url
  }))
  return request(rotated)
}
