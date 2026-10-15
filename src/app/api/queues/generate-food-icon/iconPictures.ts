import sharp from "sharp"
import type { ImagePart } from "@/ai/jev"

// The shortlisted icons' pictures for Jev's icon choice. Icons are stored as 256 px transparent WebP thumbnails; Jev takes
// base64 PNG or JPEG of at least 280 × 280, so each is flattened onto white, sized to 320 px and sent as JPEG (~300
// tokens each). A picture that can't be fetched is left out: that icon is offered by its description alone.

const SIDE = 320
// Icons don't change once drawn; a warm function reuses what it already fetched.
const cache = new Map<string, Promise<ImagePart | null>>()

async function picture(url: string, signal: AbortSignal): Promise<ImagePart | null> {
  const response = await fetch(url, { signal })
  if (!response.ok) return null
  const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
    .flatten({ background: "#ffffff" })
    .resize(SIDE, SIDE, { fit: "contain", background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }
}

/** Pictures by icon id, for the icons whose thumbnail could be read within the time allowed. */
export async function iconPictures(icons: { id: number; url: string | null }[],
  signal: AbortSignal = AbortSignal.timeout(4000)): Promise<Map<number, ImagePart>> {
  const pictures = new Map<number, ImagePart>()
  await Promise.all(icons.map(async icon => {
    if (!icon.url) return
    let pending = cache.get(icon.url)
    if (!pending) {
      pending = picture(icon.url, signal).catch(() => null)
      cache.set(icon.url, pending)
    }
    const part = await pending
    if (part) pictures.set(icon.id, part)
    else cache.delete(icon.url) // a failed read is tried again next time
  }))
  return pictures
}
