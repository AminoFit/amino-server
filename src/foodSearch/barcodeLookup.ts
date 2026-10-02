import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { normalizeGtin } from "@/mealResolution/barcode"
import { createFoodSources } from "@/mealResolution/foodSources"
import { UserFoodError } from "@/userFoods/userFoods"
import { anySignal } from "@/foodResolution/barcodePages"

type Db=ReturnType<typeof createAdminSupabase>

/** How long the camera's full lookup may take: reading shops' pages and their facts panels can take half a minute
 * (the route allows 60 s, the app waits 60 s). The fast answer comes first from identifyBarcode. */
const LOOKUP_MS=52_000

/** The catalogue food with this barcode: the user's own first, else a shared one. */
export async function catalogueFoodForGtin(db:Db,userId:string,gtin:string) {
  const known=await db.from("FoodItem").select("id").eq("gtin",gtin).is("archivedAt",null)
    .or(`privateToUserId.is.null,privateToUserId.eq.${userId}`).order("privateToUserId",{ascending:true,nullsFirst:false})
    .order("id").limit(1)
  if (known.error) throw known.error
  return ((known.data??[])[0] as {id:number}|undefined)?.id??null
}

/** The food for a barcode the app's camera read (docs/barcode-camera-plan.md), decided without a model: the user's own
 * food with that barcode, else the shared catalogue's, else a USDA, Open Food Facts or web record (a web search of the
 * digits finds supplements) added to the catalogue: the same path as a meal's barcode. Not food (a book) or unknown
 * otherwise. */
export async function foodForBarcode(userId:string,code:string,options:{db?:Db;signal?:AbortSignal;
  sources?:Pick<ReturnType<typeof createFoodSources>,"barcodeSources"|"createFoodFromSource">&
    Partial<Pick<ReturnType<typeof createFoodSources>,"barcodeProduct">>;enqueueIcon?:(foodId:number)=>Promise<unknown>}={}) {
  const gtin=normalizeGtin(code)
  if (!gtin) throw new UserFoodError("invalid_barcode",422)
  const db=options.db??createAdminSupabase()
  const known=await catalogueFoodForGtin(db,userId,gtin)
  if (known) return {status:"found" as const,gtin,foodId:known,created:false}
  const signal=anySignal(options.signal,LOOKUP_MS)
  const sources=options.sources??createFoodSources({userId,messageId:null,signal,discover:()=>{},barcodes:[gtin]},{db})
  const lookup=sources.barcodeProduct?await sources.barcodeProduct(gtin)
    :{foods:await sources.barcodeSources(gtin),notFood:null}
  const [source]=lookup.foods
  if (lookup.notFood) return {status:"not_food" as const,gtin,what:lookup.notFood}
  if (!source) return {status:"unknown" as const,gtin}
  const added=await sources.createFoodFromSource(source.sourceId)
  if (added.status!=="created"&&added.status!=="existing") return {status:"unknown" as const,gtin}
  // Outside a meal nothing else gives a new food its icon (a supplement's was queued when it was created: one job per
  // food, so this one is then skipped).
  if (added.status==="created") await (options.enqueueIcon??enqueueIcon)(added.foodId)
    .catch(()=>console.error("Barcode food created, but its icon could not be queued",{foodId:added.foodId}))
  return {status:"found" as const,gtin,foodId:added.foodId,created:added.status==="created"}
}

const enqueueIcon=async(foodId:number)=>
  (await import("@/app/api/queues/generate-food-icon/generate-food-icon")).enqueueFoodIcon(foodId)
