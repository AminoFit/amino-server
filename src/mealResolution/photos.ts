import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export type MealPhoto = {id:number;url:URL}

/** Signed URLs exist only for one resolver attempt. Persist stable photo IDs,
 * never the URL or its storage token, in the published meal revision. */
export async function loadMealPhotos(userId:string,messageId:number,attachmentIds:number[],
  includeExisting:boolean,db=createAdminSupabase()):Promise<MealPhoto[]> {
  if(!attachmentIds.length&&!includeExisting) return []
  if(attachmentIds.length>10||new Set(attachmentIds).size!==attachmentIds.length||
    attachmentIds.some(id=>!Number.isSafeInteger(id)||id<=0))
    throw new Error("media_evidence_unavailable")
  let query=db.from("UserMessageImages").select("id,imagePath")
    .eq("userId",userId).eq("messageId",messageId).order("id").limit(11)
  if(attachmentIds.length&&!includeExisting) query=query.in("id",attachmentIds)
  const response=await query
  if(response.error) throw new Error("media_evidence_unavailable")
  const rows=response.data??[]
  if(rows.length>10||attachmentIds.some(id=>!rows.some(row=>row.id===id)))
    throw new Error("media_evidence_unavailable")
  if(rows.some(row=>!row.imagePath.startsWith(`${userId}/`)||
    !row.imagePath.slice(userId.length+1)||row.imagePath.includes("..")))
    throw new Error("media_evidence_unavailable")
  return Promise.all(rows.map(async row=>{
    const signed=await db.storage.from("userUploadedImages").createSignedUrl(row.imagePath,300)
    if(signed.error||!signed.data?.signedUrl)
      throw new Error("media_evidence_unavailable")
    let url:URL
    try {url=new URL(signed.data.signedUrl)}
    catch {throw new Error("media_evidence_unavailable")}
    if(url.protocol!=="https:") throw new Error("media_evidence_unavailable")
    return {id:row.id,url}
  }))
}
