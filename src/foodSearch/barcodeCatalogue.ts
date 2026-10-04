import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodForGtin } from "./packageBarcodes"

type Db=ReturnType<typeof createAdminSupabase>

/** The catalogue food with this barcode, as its main one or another package size: the user's own first, else a shared
 * one. */
export async function catalogueFoodForGtin(db:Db,userId:string,gtin:string) {
  return (await foodForGtin(db,userId,gtin))?.foodId??null
}
