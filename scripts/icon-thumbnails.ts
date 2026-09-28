// Backfill 256 px WebP thumbnails for every FoodImage (see migration 20260927040000_icon_thumbnails): pathToImage moves
// to the thumbnail (one-year immutable cache) and the full image stays in originalPath. Old rows go to
// CatalogueAuditBackup (icon_thumbnail). Resumable: rows that already have originalPath are skipped.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/icon-thumbnails.ts [concurrency=6]
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { iconThumbnail } from "@/app/api/queues/generate-food-icon/generate-food-icon"

const db = createAdminSupabase() as any, BUCKET = "foodimages"
void (async () => {
  const log = console.log; console.log = () => {}
  const rows: { id: number; pathToImage: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodImage").select("id,pathToImage").is("originalPath", null).order("id").range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  log(`${rows.length} icons to thumbnail`)
  let done = 0, failed = 0, before = 0, after = 0
  await Promise.all(Array.from({ length: Number(process.argv[2] ?? 6) }, async () => {
    for (let row = rows.shift(); row; row = rows.shift()) {
      try {
        // The original bytes live at the object URL (older rows point at the resizing endpoint for the same file).
        const original = row.pathToImage.replace("/storage/v1/render/image/public/", "/storage/v1/object/public/").split("?")[0]
        const key = decodeURIComponent(original.split(`/object/public/${BUCKET}/`)[1] ?? "")
        if (!key) throw new Error("unrecognised path")
        const response = await fetch(original)
        if (!response.ok) throw new Error(`download ${response.status}`)
        const bytes = Buffer.from(await response.arrayBuffer()), thumb = await iconThumbnail(bytes)
        const thumbKey = `public/thumbs/${key.replace(/^public\//, "").replace(/\.[a-z]+$/i, "")}.webp`
        const up = await db.storage.from(BUCKET).upload(thumbKey, thumb, { contentType: "image/webp", cacheControl: "31536000", upsert: true })
        if (up.error) throw up.error
        const backup = await db.from("CatalogueAuditBackup").insert([{ audit: "icon_thumbnail", tableName: "FoodImage", rowId: row.id, before: { id: row.id, pathToImage: row.pathToImage } }])
        if (backup.error) throw backup.error
        const url = original.split(`/object/public/${BUCKET}/`)[0] + `/object/public/${BUCKET}/${thumbKey}`
        const updated = await db.from("FoodImage").update({ pathToImage: url, originalPath: original }).eq("id", row.id)
        if (updated.error) throw updated.error
        done++; before += bytes.length; after += thumb.length
      } catch (e: any) { failed++; log(`failed ${row.id}: ${String(e?.message ?? e).slice(0, 100)}`) }
    }
  }))
  log(`thumbnailed ${done}, failed ${failed}; ${Math.round(before / 1048576)} MB -> ${Math.round(after / 1048576 * 10) / 10} MB`)
})()
