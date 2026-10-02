import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

type Db=ReturnType<typeof createAdminSupabase>

/** The catalogue food with this barcode: the user's own first, else a shared one. */
export async function catalogueFoodForGtin(db:Db,userId:string,gtin:string) {
  const known=await db.from("FoodItem").select("id").eq("gtin",gtin).is("archivedAt",null)
    .or(`privateToUserId.is.null,privateToUserId.eq.${userId}`).order("privateToUserId",{ascending:true,nullsFirst:false})
    .order("id").limit(1)
  if (known.error) throw known.error
  return ((known.data??[])[0] as {id:number}|undefined)?.id??null
}
