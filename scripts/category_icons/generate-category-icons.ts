import axios from "axios"
import { exec } from "child_process"
import fetch from "node-fetch"
import * as fs from "node:fs/promises"
import { categories } from "./categories"
import path from "path"
import dotenv from "dotenv"
dotenv.config({ path: ".env.prod" })

const CLIPDROP_API_KEY = process.env.CLIPDROP_API_KEY

console.log("Generating Category Icons")

const regex = /^([A-Z]-\d-(\d+))\s*(.*)$/

const Authorization =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MzM4NjgsImVtYWlsIjoiY291ZHJvbkBnbWFpbC5jb20iLCJ1c2VybmFtZSI6ImNvdWRyb25AZ21haWwuY29tIiwiaWF0IjoxNzE1MjE2MTQ0fQ.hqZiz3AxbRqRRByKxYPGNRKzWfh6HP9FicovENJkQLM"

async function main() {
  const dirPath = path.join(__dirname, "assets/foodicons")
  createDirectoryIfNotExists(dirPath).catch(console.error)
  await generateIndex(32)
}

async function generateIndex(index: number) {
  const category = categories[index]
  if (category) {
    console.log(`Category ID: ${category.category}`)
    console.log(`Category Name: ${category.categoryName}`)
    console.log(`Description: ${category.iconDescription}`)
    console.log("---")
  } else {
    console.log(`No match for index: ${index}`)
    return
  }

  const dirPath = path.join("./assets/foodicons/" + category.category + "/")
  await createDirectoryIfNotExists(dirPath).catch(console.error)

  const messageId = await generateImage(category.iconDescription)
  const imageData = await waitOnImage(messageId, category.category, category.categoryName)
  console.log(`Image data: ${JSON.stringify(imageData)}`)

  const messageIdU1 = await upscaleImage(messageId, "U1")
  const imageData1 = await waitOnImage(messageIdU1, category.category, category.categoryName)

  const messageIdU2 = await upscaleImage(messageId, "U2")
  const imageData2 = await waitOnImage(messageIdU2, category.category, category.categoryName)

  const messageIdU3 = await upscaleImage(messageId, "U3")
  const imageData3 = await waitOnImage(messageIdU3, category.category, category.categoryName)

  const messageIdU4 = await upscaleImage(messageId, "U4")
  const imageData4 = await waitOnImage(messageIdU4, category.category, category.categoryName)

  const imagePath1 = `./assets/foodicons/${category.category}/1-${category.categoryName.replace(/\s+/g, "_")}.png`
  const imagePath2 = `./assets/foodicons/${category.category}/2-${category.categoryName.replace(/\s+/g, "_")}.png`
  const imagePath3 = `./assets/foodicons/${category.category}/3-${category.categoryName.replace(/\s+/g, "_")}.png`
  const imagePath4 = `./assets/foodicons/${category.category}/4-${category.categoryName.replace(/\s+/g, "_")}.png`

  await downloadImage(imageData1.uri, imagePath1)
  await downloadImage(imageData2.uri, imagePath2)
  await downloadImage(imageData3.uri, imagePath3)
  await downloadImage(imageData4.uri, imagePath4)

  await processImageWithClipDropAndSave(imagePath1)
  await processImageWithClipDropAndSave(imagePath2)
  await processImageWithClipDropAndSave(imagePath3)
  await processImageWithClipDropAndSave(imagePath4)
  console.log(`Images without background saved!`)
}

async function generateImage(iconDescription: string) {
  const prompt = `a clean vector 3d blender icon of ${iconDescription} on a pure white background --style raw --no text, words, letters, numbers, background, photo realistic details, or shadows`
  // const prompt = `Create an icon of a lowfat milk (1%) bottle. The design should be simple and modern, with minimalistic lines and a clean look. The bottle should have a label indicating '1%' in a clear, legible font. The background should be plain white to keep the focus on the bottle.`
  // const prompt = `Create an icon of a glass of milk. The design should be simple and modern, featuring minimalistic lines and shapes. Use a white background to emphasize the clean and fresh appearance of the milk. The glass itself should be a clear, sleek vessel, and the milk should be depicted with smooth, flowing lines to convey a sense of purity and simplicity.`
  // const prompt = `Create an icon of a glass of milk. The design should be simple and modern, featuring minimalistic lines and shapes. Use a white background to emphasize the clean and fresh appearance of the milk. The glass itself should be a clear, sleek vessel, and the milk should be depicted with smooth, flowing lines to convey a sense of purity and simplicity. --no text, words, letters, numbers, background, photo realistic details, or shadows --raw`
  // const prompt = `Picture a modern, minimalist icon, ${category}, 4 colors, style of nostalgia 80s --no text, words, letters, numbers, background, photo realistic details, or shadows --raw`
  // const prompt = "Single simple vector food icon. Simple Colors. Isolated on white background." + category + " --raw"
  const response = await fetch("https://api.mymidjourney.ai/api/v1/midjourney/imagine/", {
    method: "POST",
    headers: {
      Authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  })

  if (response.status !== 200) {
    console.error("Error generating image", response)
    throw new Error("Error generating image")
  }
  const data = await response.json()
  console.log("Generated image with messageId:", data.messageId)
  return data.messageId
}

async function upscaleImage(messageId: string, button: "U1" | "U2" | "U3" | "U4") {
  console.log("Upscaling image with messageId:", messageId, button)
  const response = await fetch("https://api.mymidjourney.ai/api/v1/midjourney/button/", {
    method: "POST",
    headers: {
      Authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messageId, button })
  })

  if (response.status !== 200) {
    console.error("Error upscaling image", response)
    console.log(await response.text())
    console.log(response.status)
    console.log(JSON.stringify(response))
    throw new Error("Error upscaling image")
  }
  const data = await response.json()
  return data.messageId
}

async function waitOnImage(messageId: string, name: string, id: string) {
  const startTime = Date.now()
  const timeout = 2 * 60 * 1000

  while (true) {
    await new Promise((r) => setTimeout(r, 2000))

    const response = await fetch("https://api.mymidjourney.ai/api/v1/midjourney/message/" + messageId, {
      method: "GET",
      headers: {
        Authorization,
        "Content-Type": "application/json"
      }
    })

    if (response.status !== 200) {
      console.error("Error checking image", response)
      throw new Error("Error checking image")
    }

    const data = await response.json()

    console.log(`Checking image (${name}) - ${data.status} ${data.progress || 0}%`)

    if (data.progress === 100) {
      return data
    }

    if (data.status === "FAIL") {
      console.error("Failed to generate image", data)
      throw new Error("Failed to generate image")
    }

    if (Date.now() - startTime > timeout) {
      throw new Error("Timed out waiting for image to complete")
    }
  }
}

async function downloadImage(url: string, filepath: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch image from ${url}`)

  const buffer = await response.buffer()
  await fs.writeFile(filepath, buffer)
}

async function processImageWithClipDropAndSave(filepath: string) {
  const imageBuffer = await fs.readFile(filepath)
  const blob = new Blob([imageBuffer], { type: "image/png" })
  console.log("Image buffer length:", imageBuffer.length)

  const form = new FormData()
  form.append("image_file", blob)

  console.log("Sending to ClipDrop")
  const clipDropResponse = await axios.post("https://clipdrop-api.co/remove-background/v1", form, {
    headers: { "x-api-key": CLIPDROP_API_KEY! },
    responseType: "arraybuffer" // Ensure the response is treated as binary data
  })
  console.log("ClipDrop response:", clipDropResponse.status, clipDropResponse.statusText)

  if (clipDropResponse.status !== 200) {
    throw new Error("Error in removing background" + clipDropResponse.statusText)
  }

  const outputPath = filepath.replace(".png", "_(no_bg).png")
  // Convert the response data to a Buffer before writing to the file
  const dataBuffer = Buffer.from(clipDropResponse.data)
  await fs.writeFile(outputPath, dataBuffer)
  console.log("Image written to", outputPath)

  // Delete the original image file here
  await fs.unlink(filepath)
  console.log("Original image deleted")

  return outputPath
}

main().catch((err) => console.error("Error:", err))

async function createDirectoryIfNotExists(dirPath: string) {
  try {
    await fs.access(dirPath)
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true })
  }
}
