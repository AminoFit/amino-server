import { getEmbedding, cosineSimilarity } from "../utils/embeddingsHelper"
import * as path from "path"
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env.local") })

// Logging the variables to ensure they are loaded correctly
console.log("Organization ID:", process.env.OPENAI_ORG_ID)
console.log("API Key:", process.env.OPENAI_API_KEY)

async function runSimilarityTest() {
  let foodNames = [
    "whole foods sliced turkey breast",
    "Plain Roasted Turkey Breast by Whole Foods Market",
    "Salt & Pepper Turkey Breast by Whole Foods Market",
    "Chicken Breast by Whole Foods Market",
    "Cajun Turkey Breast by Whole Foods Market",
    "sliced turkey breast",
    "Oven-Roasted Turkey Breast by 365 Whole Foods Market",
    "Whole Foods Market, Cranberries by WHOLE FOODS MARKET",
    "Whole Foods Market, Quiche by WHOLE FOODS MARKET",
    "Whole Foods Market, Sourdough by WHOLE FOODS MARKET"
  ]

  // make a single call to getEmbedding with all queries
  const allEmbeddings = await getEmbedding(foodNames)

  let similarityMatrix: number[][] = []

  // Calculate the upper triangle of the similarity matrix
  for (let i = 0; i < foodNames.length; i++) {
    similarityMatrix[i] = []
    for (let j = 0; j <= i; j++) {
      if (i === j) {
        similarityMatrix[i][j] = 1 // Similarity with itself is 1
      } else {
        const similarity = cosineSimilarity(allEmbeddings.data[i].embedding, allEmbeddings.data[j].embedding)
        similarityMatrix[i][j] = similarity
        similarityMatrix[j][i] = similarity // Since [i][j] == [j][i]
      }
    }
  }

  // Log the matrix or render it as needed
  console.log(similarityMatrix)

  // Create a CSV string with headers for download
  const csvHeader = "," + foodNames.join(",")
  const csvContent = [csvHeader, ...similarityMatrix.map((row, i) => foodNames[i] + "," + row.join(","))].join("\n")
  console.log(csvContent)

  // Create an array of objects with food name and its similarity to the first item
  let similarityToFirstItem = foodNames.map((foodName, index) => {
    return {
      name: foodName,
      similarity: similarityMatrix[0][index]
    }
  })

  // Sort the array in descending order of similarity
  similarityToFirstItem.sort((a, b) => b.similarity - a.similarity)

  // Log the sorted array
  similarityToFirstItem.forEach((item, index) => {
    console.log(`item ${index + 1}: ${item.name} - Similarity: ${item.similarity}`)
  })
}

runSimilarityTest()
