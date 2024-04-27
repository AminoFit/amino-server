import { foodToLogEmbedding, getFoodEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { findBestFoodMatchtoLocalDb } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDb"
import { findBestFoodMatchtoLocalDbClaude } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDbClaude"
import { findBestFoodMatchtoLocalDbLlama } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDbLlama"
import { Tables } from "types/supabase"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"
import { getBestFoodEmbeddingMatches } from "@/foodMessageProcessing/getBestFoodEmbeddingMatches/getBestFoodEmbeddingMatches"

async function testMatching(foodItems: FoodItemToLog[]) {
    const user = (await getUserByEmail("seb.grubb@gmail.com"))! as Tables<"User">
    
    for (const item of foodItems) {
      let name = item.food_database_search_name
      let brand = item.brand
      console.log(`Processing item: ${name} (${item.brand || "No Brand"})`)
  
      // Step 1: Get the embeddings of each item
      const embeddingStart = performance.now();
      const embedding = await foodToLogEmbedding(item);
      const embeddingEnd = performance.now();
      if (!embedding) {
        console.log(`Failed to get embedding for ${name} in ${Math.round(embeddingEnd - embeddingStart)} ms`)
        continue;
      }
  
      // Step 2: Simulate cosine match results
      const cosineMatchResults = await getBestFoodEmbeddingMatches(embedding.embedding_cache_id)
  
      // Step 3: Match using the three functions
      const functionNames = ["GPT", "Llama", "Claude"];
      const functions = [findBestFoodMatchtoLocalDb, findBestFoodMatchtoLocalDbLlama, findBestFoodMatchtoLocalDbClaude];
  
      let results = [];
      for (let i = 0; i < functions.length; i++) {
        const startTime = performance.now();
        const result = await functions[i](cosineMatchResults, item, user);
        const endTime = performance.now();
  
        results.push({
            name: functionNames[i],
            time: endTime - startTime,
            matches: result.map(match => match ? `${match.name}${match.brand ? ':' : ''}${match.brand || 'null'}` : "No match").join(' - ')
        });
        
      }
  
      // Print results
      results.forEach(result => {
        console.log(`${result.name}: ${Math.round(result.time)} ms - ${result.matches}`);
      });
    }
  }
  

const testFoodItems = [
  {
    food_database_search_name: "Fat free milk (Fairlife)",
    full_item_user_message_including_serving: "Fairlife Fat Free milk",
    branded: true,
    brand: "Fairlife",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Semi skim milk",
    full_item_user_message_including_serving: "Semi skim milk",
    branded: true,
    brand: "Fairlife",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Strawberry poptarts",
    full_item_user_message_including_serving: "Amazon Strawberry poptarts",
    branded: true,
    brand: "Amazon",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Strawberry core power elite shake",
    full_item_user_message_including_serving: "Strawberry core power elite shake by Fairlife",
    branded: true,
    brand: "Fair Life",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Intense Dark 86% Cacao Dark Chocolate",
    full_item_user_message_including_serving: "Intense Dark 86% Cacao Dark Chocolate by Ghirardelli",
    branded: true,
    brand: "Ghirardelli",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Original Oat Milk",
    full_item_user_message_including_serving: "Oatly Original Oat Milk by Ghirardelli",
    branded: true,
    brand: "Oatly",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Energy Caribbean Crush Sports Drink",
    full_item_user_message_including_serving: "Lucozade Energy Caribbean Crush ",
    branded: true,
    brand: "Lucozade",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: "Mini Chicken & Vegetable Wonton",
    full_item_user_message_including_serving: "Mini Chicken & Vegetable Wonton bibigo",
    branded: true,
    brand: "bibigo",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  {
    food_database_search_name: " crackers multigrain",
    full_item_user_message_including_serving: "crunchmaster crackers multigrain",
    branded: true,
    brand: "crunchmaster",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  }
] as FoodItemToLog[]

testMatching(testFoodItems)
	
