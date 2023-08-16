import { getEmbedding, cosineSimilarity } from "../utils/embeddingsHelper";
import * as path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env.local") });

// Logging the variables to ensure they are loaded correctly
console.log('Organization ID:', process.env.OPENAI_ORG_ID);
console.log('API Key:', process.env.OPENAI_API_KEY);

async function runSimilarityTest() {
    let foodNames = [
      "Strawberry",
      "Strawberry Yogurt",
      "Skim Milk",
      "Non-Skim Milk",
      "White Rice",
      "Brown Rice",
      "McDonald's Big Mac",
      "Coca-Cola",
      "Coke",
      "Diet Coca-Cola",
      "Diet Coke",
      "Grilled Chicken",
      "Fried Chicken",
      "Whole Wheat Bread",
      "White Bread",
      "Ben & Jerry's Chocolate Fudge Brownie",
      "Green Tea",
      "Green Apple",
      "Red Apple",
      "Iced Coffee",
      "Hot Coffee",
      "Dark Chocolate",
      "Milk Chocolate",
      "Tuna Salad",
      "Caesar Salad",
      "Pepsi",
      "Diet Pepsi",
      "Orange Juice",
      "Orange Soda",
      "Quaker Oats",
      "Old Fashioned Oats",
      "Banana",
      "Banana Bread",
      "Greek Yogurt",
      "Non-Fat Greek Yogurt",
      "Almond Milk",
      "Soy Milk",
      "Eggs",
      "Chicken Eggs",
      "Duck Eggs",
      "Olive Oil",
      "Extra Virgin Olive Oil",
      "Plain Bagel",
      "Whole Wheat Bagel",
      "Cheerios",
      "Honey Nut Cheerios",
      "Raisin Bran",
      "Kellogg's Corn Flakes",
      "Organic Honey",
      "Regular Honey",
      "Salted Butter",
      "Unsalted Butter",
      "Heinz Ketchup"
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