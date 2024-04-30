import { foodToLogEmbedding, getFoodEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { findBestFoodMatchtoLocalDb } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDb"
import { findBestFoodMatchtoLocalDbClaude } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDbClaude"
import { findBestFoodMatchtoLocalDbLlama } from "@/foodMessageProcessing/localDbFoodMatch/matchFoodItemToLocalDbLlama"
import { Tables } from "types/supabase"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"
import { getBestFoodEmbeddingMatches } from "@/foodMessageProcessing/getBestFoodEmbeddingMatches/getBestFoodEmbeddingMatches"
import { getFoodItemFromDbOrExternal } from "@/foodMessageProcessing/findBestLoggedFoodItemMatchToFood"
import { findBestServingMatchChatLlama } from "@/foodMessageProcessing/getServingSizeFromFoodItem/getServingSizeFromFoodItem"
import { std, mean, quantileSeq } from 'mathjs';
import { findBestServingMatchChat } from "@/foodMessageProcessing/findBestServingMatchChat"

async function testMatching(foodItems: FoodItemToLog[]) {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))! as Tables<"User">

  for (const item of foodItems) {
    let name = item.food_database_search_name
    let brand = item.brand
    console.log(`Processing item: ${name} (${item.brand || "No Brand"})`)

    // Step 1: Get the embeddings of each item
    const embeddingStart = performance.now()
    const embedding = await foodToLogEmbedding(item)
    const embeddingEnd = performance.now()
    if (!embedding) {
      console.log(`Failed to get embedding for ${name} in ${Math.round(embeddingEnd - embeddingStart)} ms`)
      continue
    }

    // Step 2: Simulate cosine match results
    const cosineMatchResults = await getBestFoodEmbeddingMatches(embedding.embedding_cache_id)

    // Step 3: Match using the three functions
    const functionNames = ["GPT", "Llama", "Claude"]
    const functions = [findBestFoodMatchtoLocalDb, findBestFoodMatchtoLocalDbLlama, findBestFoodMatchtoLocalDbClaude]

    let results = []
    for (let i = 0; i < functions.length; i++) {
      const startTime = performance.now()
      const result = await functions[i](cosineMatchResults, item, user)
      const endTime = performance.now()

      results.push({
        name: functionNames[i],
        time: endTime - startTime,
        matches: result
          .map((match) => (match ? `${match.name}${match.brand ? ":" : ""}${match.brand || "null"}` : "No match"))
          .join(" - ")
      })
    }

    // Print results
    results.forEach((result) => {
      console.log(`${result.name}: ${Math.round(result.time)} ms - ${result.matches}`)
    })
  }
}

async function testMatchingAndServingSize(foodItems: FoodItemToLog[]) {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))! as Tables<"User">

  let timesLlama = [];
  let timesGPT = [];
  let differences = [];

  for (const item of foodItems) {
    let name = item.food_database_search_name;
    let brand = item.brand;
    console.log(`Processing item: ${name} (${brand || "No Brand"})`);

    const embedding = await foodToLogEmbedding(item);
    if (!embedding) {
      console.log(`Failed to get embedding for ${name}`);
      continue;
    }
    const cosineMatchResults = await getBestFoodEmbeddingMatches(embedding.embedding_cache_id);

    const llamaMatchResult = await findBestFoodMatchtoLocalDbLlama(cosineMatchResults, item, user);
    if (llamaMatchResult[0] === null && llamaMatchResult[1] === null) {
      console.log("No valid matches found using Llama");
      continue;
    }
    const foodItemLlama = await getFoodItemFromDbOrExternal(llamaMatchResult[0]!, user, 1);
    
    const llamaMatchStart = performance.now();
    const servingMatchResultLlama = await findBestServingMatchChatLlama(item, foodItemLlama, user);
    const llamaMatchEnd = performance.now();
    timesLlama.push(llamaMatchEnd - llamaMatchStart);

    const gptMatchStart = performance.now();
    const servingMatchResultGPT = await findBestServingMatchChat(item, foodItemLlama, user);
    const gptMatchEnd = performance.now();
    timesGPT.push(gptMatchEnd - gptMatchStart);

    if (servingMatchResultLlama && servingMatchResultGPT && servingMatchResultLlama.serving && servingMatchResultGPT.serving && servingMatchResultLlama.serving.total_serving_g_or_ml !== servingMatchResultGPT.serving.total_serving_g_or_ml) {
      differences.push({
        item: name,
        llama: servingMatchResultLlama.serving.total_serving_g_or_ml,
        gpt: servingMatchResultGPT.serving.total_serving_g_or_ml
      });
      console.log("the two results are different")
    } else {
      console.log("The two results are the same");
      console.log(servingMatchResultLlama);
    }
  }

  console.log("Time Analysis:");
  console.log(`Median time Llama: ${quantileSeq(timesLlama, 0.5)} ms`);
  console.log(`Percentiles for Llama: 5th: ${quantileSeq(timesLlama, 0.05)}, 25th: ${quantileSeq(timesLlama, 0.25)}, 75th: ${quantileSeq(timesLlama, 0.75)}, 95th: ${quantileSeq(timesLlama, 0.95)} ms`);
  console.log(`Median time GPT: ${quantileSeq(timesGPT, 0.5)} ms`);
  console.log(`Percentiles for GPT: 5th: ${quantileSeq(timesGPT, 0.05)}, 25th: ${quantileSeq(timesGPT, 0.25)}, 75th: ${quantileSeq(timesGPT, 0.75)}, 95th: ${quantileSeq(timesGPT, 0.95)} ms`);

  if (differences.length > 0) {
    console.log("Differences in serving sizes:");
    differences.forEach(diff => {
      console.log(`Item: ${diff.item}, Llama: ${diff.llama}, GPT: ${diff.gpt}`);
    });
  }
}

const testFoodItems = [
  {
    food_database_search_name: "peanut",
    full_item_user_message_including_serving: "4 whole peanuts",
    branded: false,
    brand: "",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  },
  // {
  //   food_database_search_name: "walnut",
  //   full_item_user_message_including_serving: "20 half walnuts",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "chocolate chip cookie",
  //   full_item_user_message_including_serving: "a third of a chocolate chip cookie",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "chicken breast",
  //   full_item_user_message_including_serving: "half achicken breast",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "milk",
  //   full_item_user_message_including_serving: "2 fl oz of milk",
  //   branded: true,
  //   brand: "milk",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "metamucil fiber gummies",
  //   full_item_user_message_including_serving: "3 metamucil fiber gummies",
  //   branded: true,
  //   brand: "metamucil",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "snickers",
  //   full_item_user_message_including_serving: "one snickers",
  //   branded: true,
  //   brand: "snickers",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Chia Seed Pudding",
  //   full_item_user_message_including_serving: "one serving of Chia Seed Pudding",
  //   branded: true,
  //   brand: "Juice Press",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "hashbrown",
  //   full_item_user_message_including_serving: "12 hashbrown pieces",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Carbo Gain",
  //   full_item_user_message_including_serving: "100 cals of Carbo Gain",
  //   branded: true,
  //   brand: "Carbo Gain",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Platinum Hydrowhey Protein",
  //   full_item_user_message_including_serving: "one scoop of Optimum Nutrition Platinum Hydrowhey Protein",
  //   branded: true,
  //   brand: "Optimum Nutrition",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "mango",
  //   full_item_user_message_including_serving: "half a mango",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  //   {
  //   food_database_search_name: "avocado",
  //   full_item_user_message_including_serving: "half an avocado",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Chocolate Elite Core Power Shake",
  //   full_item_user_message_including_serving: "Chocolate Elite Core Power Shake",
  //   branded: true,
  //   brand: "Core Power Fairlife",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Intense Dark 72% Cacao Dark Chocolate",
  //   full_item_user_message_including_serving: "Intense Dark 72% Cacao Dark Chocolate",
  //   branded: true,
  //   brand: "Ghirardelli",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "salmon avocado sushi",
  //   full_item_user_message_including_serving: "one roll of salmon avocado sushi",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "skinny dipped dark chocolate almonds",
  //   full_item_user_message_including_serving: "one bag of skinny dipped dark chocolate almonds",
  //   branded: true,
  //   brand: "Skinny Dipped",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "rice cakes",
  //   full_item_user_message_including_serving: "240 calories of rice cakes",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Magic spoon peanut butter cereal",
  //   full_item_user_message_including_serving: "Magic spoon peanut butter cereal",
  //   branded: true,
  //   brand: "Magic spoon",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "cinnamon bagel",
  //   full_item_user_message_including_serving: "290 cals of cinnamon bagel",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "apple",
  //   full_item_user_message_including_serving: "1 apple",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "strawberry",
  //   full_item_user_message_including_serving: "5 mediumstrawberries",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "raspberry",
  //   full_item_user_message_including_serving: "5 raspberries",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Nutella",
  //   full_item_user_message_including_serving: "Nutella 1 tbsp",
  //   branded: true,
  //   brand: "Ferrero",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Dave's Killer Bread",
  //   full_item_user_message_including_serving: "1 slice of Dave's Killer Bread",
  //   branded: true,
  //   brand: "Dave's Killer Bread",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Hazelnut Chocolate Spread",
  //   full_item_user_message_including_serving: "5 oz of Bonne Maman Hazelnut Chocolate Spread",
  //   branded: true,
  //   brand: "Bonne Maman",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Vanilla Core Power Elite Shake",
  //   full_item_user_message_including_serving: "Vanilla Core Power Elite Shake by Fairlife",
  //   branded: true,
  //   brand: "Core Power Fairlife",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Smooth Peanut Butter",
  //   full_item_user_message_including_serving: "Smooth Peanut Butter Amazon 1 tbsp",
  //   branded: true,
  //   brand: "Amazon Fresh Happy Belly",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Fat free milk (Fairlife)",
  //   full_item_user_message_including_serving: "Fairlife Fat Free milk",
  //   branded: true,
  //   brand: "Fairlife",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Semi skim milk",
  //   full_item_user_message_including_serving: "Semi skim milk",
  //   branded: true,
  //   brand: "Fairlife",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Strawberry poptarts",
  //   full_item_user_message_including_serving: "Amazon Strawberry poptarts",
  //   branded: true,
  //   brand: "Amazon",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Strawberry core power elite shake",
  //   full_item_user_message_including_serving: "Strawberry core power elite shake by Fairlife",
  //   branded: true,
  //   brand: "Fair Life",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Intense Dark 86% Cacao Dark Chocolate",
  //   full_item_user_message_including_serving: "Intense Dark 86% Cacao Dark Chocolate by Ghirardelli",
  //   branded: true,
  //   brand: "Ghirardelli",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Original Oat Milk",
  //   full_item_user_message_including_serving: "Oatly Original Oat Milk by Ghirardelli",
  //   branded: true,
  //   brand: "Oatly",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Energy Caribbean Crush Sports Drink",
  //   full_item_user_message_including_serving: "Lucozade Energy Caribbean Crush ",
  //   branded: true,
  //   brand: "Lucozade",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "beef tenderloin",
  //   full_item_user_message_including_serving: "400 cals of beef tenderloin",
  //   branded: false,
  //   brand: "",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "Mini Chicken & Vegetable Wonton",
  //   full_item_user_message_including_serving: "3 Mini Chicken & Vegetable Wonton bibigo",
  //   branded: true,
  //   brand: "bibigo",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // },
  // {
  //   food_database_search_name: "crackers multigrain",
  //   full_item_user_message_including_serving: "crunchmaster crackers multigrain",
  //   branded: true,
  //   brand: "crunchmaster",
  //   serving: {
  //     serving_g_or_ml: "g",
  //     total_serving_g_or_ml: 100
  //   }
  // }
] as FoodItemToLog[]

testMatchingAndServingSize(testFoodItems)

// testMatching(testFoodItems)
