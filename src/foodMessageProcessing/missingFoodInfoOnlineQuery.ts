import { perplexityChatCompletion } from "@/languageModelProviders/perplexity/perplexityChatCompletion"

const prompt = `
Provide a structured response with nutritional information per serving about "FOOD_INFO". Find info for similar items if no nutritional information is found for the item.

Try to at least always include info about calories, weight, protein, fat, carbs, and servings.

Once you have the information, please provide a structured response with the following information:
{
  food_name: string,
  calories_per_serving: number,
  weight_per_serving: number,
  weight_unit: string,
  protein_per_serving: number,
  fat_per_serving: number,
  carbs_per_serving: number,
  serving: {
    serving_name: string,
    serving_weight_grams: number,
    serving_weight_unit: string,
  }[]
}
`

export async function getMissingFoodInfoOnlineQuery(foodName: string): Promise<string | null> {
  const model = "sonar-medium-online"
  const messages = [
    {
      role: "user",
      content: prompt.replace("FOOD_INFO", foodName)
    }
  ]
  const temperature = 0.01
  const response = await perplexityChatCompletion({ model, messages, temperature })

  if (response.choices[0].message.content) {
    return response.choices[0].message.content
  } else {
    return null
  }
}

async function testGetFoodInfo() {
  const result = await getMissingFoodInfoOnlineQuery("Why Bars Zesty Lemon")
  console.log(result)
}

// testGetFoodInfo()