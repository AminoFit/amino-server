// Draws icons with the current prompt into a folder, without saving them anywhere: for comparing prompt changes.
// Usage: npx ts-node ... scripts/trial-icon-prompt.ts <outDir> "<food name>" ["<food name>" ...]
import { writeFileSync } from "fs"
import { iconPrompt } from "@/app/api/queues/generate-food-icon/generate-food-icon"
import { IMAGE_MODEL } from "@/ai/models"

async function draw(name: string) {
  const response = await fetch("https://openrouter.ai/api/v1/images", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY}` },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: iconPrompt(name), n: 1, size: "1024x1024", quality: "medium",
      background: "transparent", output_format: "png" }) })
  const json = await response.json() as { data?: { b64_json?: string }[] }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error(`${name}: ${response.status} ${JSON.stringify(json).slice(0, 200)}`)
  return Buffer.from(b64, "base64")
}

const [outDir, ...names] = process.argv.slice(2)
Promise.all(names.map(async (name, index) => writeFileSync(`${outDir}/${index}.png`, await draw(name))))
  .then(() => console.log("done"), error => { console.error(error); process.exit(1) })
