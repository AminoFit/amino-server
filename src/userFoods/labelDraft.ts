// "Scan label" in the food editor: the label model transcribes the panel, ZXing reads any barcode, and the app gets a
// draft to review. Nothing is saved here. A barcode that is already in the catalogue is returned so the app can offer
// that food instead of a duplicate.
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { readNutritionLabel, labelSourceInput } from "@/mealResolution/labelReader"
import { decodeBarcode, locateBarcodesWithFlash } from "@/mealResolution/barcode"
import { UserFoodError } from "./userFoods"
import { kjToKcal, microsFrom } from "@/nutrition"


export async function labelDraft(userId:string,imagePath:string,db=createAdminSupabase()) {
  // Only the user's own uploads (the app stores them under their ID).
  if (!imagePath.startsWith(`${userId}/`)||imagePath.length<=userId.length+1||imagePath.includes(".."))
    throw new UserFoodError("photo_unavailable",404)
  const signed=await db.storage.from("userUploadedImages").createSignedUrl(imagePath,300)
  if (signed.error||!signed.data?.signedUrl) throw new UserFoodError("photo_unavailable",404)
  const url=new URL(signed.data.signedUrl)
  const signal=AbortSignal.timeout(60_000)
  const [facts,gtin]=await Promise.all([
    readNutritionLabel(url,{signal}),
    fetch(url,{signal:AbortSignal.timeout(8000)})
      .then(async response=>response.ok?(await decodeBarcode(Buffer.from(await response.arrayBuffer()),{locate:locateBarcodesWithFlash}))?.gtin??null:null)
      .catch(()=>null)])
  let existingFood:{id:number;name:string;brand:string|null}|null=null
  if (gtin) {
    const {data}=await db.from("FoodItem").select("id,name,brand").eq("gtin",gtin).is("archivedAt",null)
      .or(`privateToUserId.is.null,privateToUserId.eq.${userId}`).order("id").limit(1)
    existingFood=(data?.[0] as unknown as typeof existingFood)??null
  }
  if (!facts) return {legible:false as const,gtin,existingFood}
  const kcal=facts.kcal??(facts.kj!=null?kjToKcal(facts.kj):null)
  if (kcal==null) return {legible:false as const,gtin,existingFood}
  const read=labelSourceInput({...facts,kcal},{name:"",brand:null,gtin,identified:false})
  return {legible:true as const,gtin,existingFood,
    serving:{unit:read.servingUnit,amount:read.servingAmount,grams:read.servingGrams},packageGrams:read.packageGrams,
    kcal:Math.round(kcal*10)/10,proteinG:read.proteinG,carbG:read.carbG,totalFatG:read.totalFatG,
    fiberG:read.fiberG,sugarG:read.sugarG,satFatG:read.satFatG,addedSugarG:read.addedSugarG??null,transFatG:read.transFatG??null,
    // Vitamins and minerals per serving, by the app's nutrient keys (magnesiumMg…), for the editor's other nutrients.
    nutrients:microsFrom(facts.micronutrients??[])}
}
