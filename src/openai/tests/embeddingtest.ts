import { getEmbedding, cosineSimilarity } from "../utils/embeddingsHelper";
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env.local") });

// Logging the variables to ensure they are loaded correctly
console.log('Organization ID:', process.env.OPENAI_ORG_ID);
console.log('API Key:', process.env.OPENAI_API_KEY);

async function runSimilarityTest() {
    let foodNames = [
      "apple",
      "appel",
      "Granny Smith",
      "Granny Smith Apple",
      "Granny Smith Apple from Safeway",
      "Royal Gala",
      "Royal Gala Apple",
      "Apple",
      "APPLE",
      "Apple from Safeway",
      "Apple from Whole Foods",
      "Apple from Trader Joe's",
      "Apple from Costco",
      "Banana",
      "BANANA",
      "YELLOW",
      "RIPE BANANA",
      "Banana from Safeway",
      "Banana from Whole Foods",
      "Banana from Trader Joe's",
      "Banana from Costco",
      "Orange",
      "Orange from Safeway",
      "Orange from Whole Foods",
      "Orange from Trader Joe's",
      "Orange from Costco",
      "Pear",
      "Protein Shake",
      "Protien Shake",
      "Protein Shake from Whole Foods",
      "Protein Shake from Safeway",
      "Coca Cola"
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
          const similarity = cosineSimilarity(
            allEmbeddings.data[i].embedding,
            allEmbeddings.data[j].embedding
          )
          similarityMatrix[i][j] = similarity
          similarityMatrix[j][i] = similarity // Since [i][j] == [j][i]
        }
      }
    }
  
    // Log the matrix or render it as needed
    console.log(similarityMatrix)
  
    // Create a CSV string with headers for download
    const csvHeader = "," + foodNames.join(",")
    const csvContent = [
      csvHeader,
      ...similarityMatrix.map((row, i) => foodNames[i] + "," + row.join(","))
    ].join("\n")
    console.log(csvContent)
  }

  runSimilarityTest()