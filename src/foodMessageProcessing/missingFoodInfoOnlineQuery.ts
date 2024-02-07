import { perplexityChatCompletion } from "@/languageModelProviders/perplexity/perplexityChatCompletion"

const prompt = `
Please be brief and succinct.
Using all possible info output in a short structured way all info about:
FOOD_INFO

1. You must include:
{ calories: number,
    weight: number,
weight_unit: string,
protein: number,
fat: number,
carbs: number,
serving: {
    serving_name: string,
    serving_weight: number,
    serving_weight_unit: string,
    serving_calories: number
}[]
} 
WEIGHT MUST BE INCLUDED IN ANY UNIT POSSIBLE (g, oz, ml)

2. If you can't find the info, please do a best guess based on similar items.
If weight is not available, estimate using 1-2 sentences of reasoning what it could be based on common info and say the macro info.
The weight of an item cannot be less than the sum of the weight of its macronutrients (e.g. if it has 10g carbs and 10g protein it is clearly 20g or more).
`

export async function getMissingFoodInfoOnlineQuery(foodName: string): Promise<string | null> {
  const model = "pplx-70b-online"
  const messages = [
    { role: "system", content: "You are a useful food assistant that knows all about calories and item weights." },
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
  const result = await getMissingFoodInfoOnlineQuery("shrimp shumai by JFC")
  console.log(result)
}

// testGetFoodInfo()