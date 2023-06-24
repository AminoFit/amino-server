import { Configuration, OpenAIApi } from "openai";
const configuration = new Configuration({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY,
});
export const openai = new OpenAIApi(configuration);
// const response = await openai.listEngines();

export const logFoodSchema = {
  type: "object",
  properties: {
    food_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          unit: {
            type: "string",
            enum: ["grams", "ml", "cups", "pieces", "teaspoons"],
          },
          amount: { type: "number" },
          fat: { type: "number" },
          carbohydrates: { type: "number" },
          protein: { type: "number" },
          calories: { type: "number" },
        },
        required: [
          "name",
          "unit",
          "amount",
          "fat",
          "carbohydrates",
          "protein",
          "calories",
        ],
      },
    },
    // instructions: {
    //   type: "array",
    //   description: "Steps to prepare the recipe (no numbering)",
    //   items: { type: "string" },
    // },
    total_calories: {
      type: "number",
      description: "The total calories in the meal",
    },
  },
  required: ["ingredients", "total_calories"],
};
