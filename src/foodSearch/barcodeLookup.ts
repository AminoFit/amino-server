import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { normalizeGtin } from "@/mealResolution/barcode"
import { createFoodSources } from "@/mealResolution/foodSources"
import { UserFoodError } from "@/userFoods/userFoods"

type Db=ReturnType<typeof createAdminSupabase>

/** The food for a barcode the app's camera read (docs/barcode-camera-plan.md), decided without a model: the user's own
 * food with that barcode, else the shared catalogue's, else a USDA, Open Food Facts or web record (a web search of the
 * digits finds supplements) added to the catalogue: the same path as a meal's barcode. Not food (a book) or unknown
 * otherwise. */
export async function foodForBarcode(userId:string,code:string,options:{db?:Db;signal?:AbortSignal;
  sources?:Pick<ReturnType<typeof createFoodSources>,"barcodeSources"|"createFoodFromSource">&
    Partial<Pick<ReturnType<typeof createFoodSources>,"barcodeProduct">>}={}) {
  const gtin=normalizeGtin(code)
  if (!gtin) throw new UserFoodError("invalid_barcode",422)
  const db=options.db??createAdminSupabase()
  // The user's own food wins over the shared one.
  const known=await db.from("FoodItem").select("id").eq("gtin",gtin).is("archivedAt",null)
    .or(`privateToUserId.is.null,privateToUserId.eq.${userId}`).order("privateToUserId",{ascending:true,nullsFirst:false})
    .order("id").limit(1)
  if (known.error) throw known.error
  const row=(known.data??[])[0] as {id:number}|undefined
  if (row) return {status:"found" as const,gtin,foodId:row.id,created:false}
  const sources=options.sources??createFoodSources({userId,messageId:null,signal:options.signal??AbortSignal.timeout(28_000),
    discover:()=>{},barcodes:[gtin]},{db})
  const lookup=sources.barcodeProduct?await sources.barcodeProduct(gtin)
    :{foods:await sources.barcodeSources(gtin),notFood:null}
  const [source]=lookup.foods
  if (lookup.notFood) return {status:"not_food" as const,gtin,what:lookup.notFood}
  if (!source) return {status:"unknown" as const,gtin}
  const added=await sources.createFoodFromSource(source.sourceId)
  if (added.status!=="created"&&added.status!=="existing") return {status:"unknown" as const,gtin}
  return {status:"found" as const,gtin,foodId:added.foodId,created:added.status==="created"}
}
