import {
  foodItemCompletion,
  checkCompliesWithSchema,
} from "./foodItemCompletion"; // replace 'yourFile' with the name of the file that contains messageHandlingFunction
import { chatCompletion } from "./chatCompletion";
import { ChatCompletionRequestMessage } from "openai";

async function main() {
  const outputSchema = {
    type: "object",
    properties: {
      food_info: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the food item, e.g. Banana, Steak, Salad",
            },
            brand: {
              type: "string",
              nullable: true,
              description: "Brand name, if applicable",
            },
            known_as: {
              type: "array",
              items: { type: "string" },
              description: "Other names the food is known by",
            },
            food_nutrition_info: {
              type: "string",
              nullable: true,
              description:
                "Description about the food item focusing on nutrition",
            },
            default_serving_size: {
              type: "integer",
              description:
                "Default serving size of the food, 100g strongly recommended",
            },
            default_serving_unit: {
              type: "string",
              description:
                "Unit of the default serving size, grams strongly recommended",
            },
            default_serving_weight_grams: {
              type: "integer",
              nullable: true,
              description:
                "Weight of the serving in grams if default unit is not grams",
            },
            calories_per_serving: {
              type: "number",
              description: "Calories per serving",
            },
            total_fat_per_serving: {
              type: "number",
              nullable: true,
              description: "Total fat content per serving in grams",
            },
            saturated_fat_per_serving: {
              type: "number",
              nullable: true,
              description: "Saturated fat content per serving in grams",
            },
            trans_fat_per_serving: {
              type: "number",
              nullable: true,
              description: "Trans fat content per serving in grams",
            },
            carb_per_serving: {
              type: "number",
              description: "Carbohydrate content per serving in grams",
            },
            sugar_per_serving: {
              type: "number",
              nullable: true,
              description: "Sugar content per serving in grams",
            },
            added_sugar_per_serving: {
              type: "number",
              nullable: true,
              description: "Added sugar content per serving in grams",
            },
            protein_per_serving: {
              type: "number",
              description: "Protein content per serving in grams",
            },
            nutrients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description:
                      "Name of the nutrient, e.g. Sodium, Potassium, Vitamin C",
                  },
                  unit: {
                    type: "string",
                    description: "Unit of the nutrient, usually grams",
                  },
                  value_per_gram: {
                    type: "number",
                    description: "Amount of the nutrient per gram of the food",
                  },
                },
              },
              description: "Additional nutrients that might be of interest",
            },
            servings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  serving_weight_gram: {
                    type: "number",
                    description: "Weight of the serving in grams",
                  },
                  serving_name: {
                    type: "string",
                    description:
                      "Description of the serving, e.g. 1 large banana, 1 cup of coffee",
                  },
                },
              },
              description: "Different serving sizes and their descriptions.",
            },
          },
          required: [
            "name",
            "default_serving_size",
            "default_serving_unit",
            "calories_per_serving",
            "protein_per_serving",
            "carb_per_serving",
            "total_fat_per_serving",
          ],
        },
      },
    },
    required: ["food_info"],
  };

  const objectotest = {
    food_info: [
      {
        name: "banana",
        brand: "",
        known_as: [],
        food_nutrition_info: "",
        default_serving_size: 100,
        default_serving_unit: "grams",
        default_serving_weight_grams: 100,
        calories_per_serving: 96,
        total_fat_per_serving: 0.4,
        saturated_fat_per_serving: 0.1,
        trans_fat_per_serving: 0,
        carb_per_serving: 25,
        sugar_per_serving: 14,
        added_sugar_per_serving: 0,
        protein_per_serving: 1.1,
        nutrients: [
          {
            label: "Fiber",
            unit: "grams",
            value_per_gram: 1.7,
          },
          {
            label: "Vitamin C",
            unit: "mg",
            value_per_gram: 8.7,
          },
          {
            label: "Potassium",
            unit: "mg",
            value_per_gram: 358,
          },
        ],
        servings: [],
      },
      {
        name: "Starbucks Latte",
        brand: "Starbucks",
        known_as: [],
        food_nutrition_info: "",
        default_serving_size: 16,
        default_serving_unit: "fl oz",
        default_serving_weight_grams: 480,
        calories_per_serving: 190,
        total_fat_per_serving: 7,
        saturated_fat_per_serving: 4.5,
        trans_fat_per_serving: 0.2,
        carb_per_serving: 25,
        sugar_per_serving: 24,
        added_sugar_per_serving: 0,
        protein_per_serving: 12,
        nutrients: [
          {
            label: "Calcium",
            unit: "mg",
            value_per_gram: 0.1,
          },
          {
            label: "Iron",
            unit: "mg",
            value_per_gram: 0.1,
          },
          {
            label: "Vitamin A",
            unit: "IU",
            value_per_gram: 0.1,
          },
          {
            label: "Vitamin C",
            unit: "mg",
            value_per_gram: 0.1,
          },
        ],
        servings: [],
      },
    ],
  };

  const objectotest2 = {
    food_info: [
      { name: 'Apple' },
      { name: 'Dunkin Donut Latte' },
      { name: 'Ground Beef' }
    ]
  }

  console.log(checkCompliesWithSchema(outputSchema, objectotest));
  console.log(checkCompliesWithSchema(outputSchema, objectotest2));

  try {
    const result = await foodItemCompletion("Starbucks Latte, Ground Turkey");
    console.log(result);
    //await messageHandlingFunction(system, inquiry);
  } catch (error) {
    console.error(error);
  }
}

main();
