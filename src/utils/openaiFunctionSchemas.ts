import { Configuration, OpenAIApi } from "openai"

const configuration = new Configuration({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY
})
export const openai = new OpenAIApi(configuration)

export const logFoodSchema = {
  type: "object",
  description: "Food items that were eaten by a user",
  properties: {
    food_items: {
      type: "array",
      description: "An array of food items that were eaten",
      items: {
        type: "object",
        description: "A food item",
        properties: {
          full_name: {
            type: "string",
            description:
              "Comprehensive name of the food item. Include details such as low fat version or not, cooked or uncooked etc. Fix any typos."
          },
          brand: { type: "string", description: "The brand of the food item" },
          branded: {
            type: "boolean",
            description: "If item is branded or not"
          },
          lemmatized_database_search_term: {
            type: "string",
            description:
              "Basic terms to search for in a database, ideally the lemmatized version"
          },
          user_food_descriptive_name: {
            type: "string",
            description: "What the user calls the food, fix any potential typos"
          },
          timeEaten: {
            type: "string",
            description:
              "Optional. Time the user consumed the food item in ISO 8601 String format. Example: 2014-09-08T08:02:17-04:00 (no fractional seconds)"
          },
          serving: {
            type: "object",
            properties: {
              serving_amount: {
                type: "number",
                description: "Amount of the serving"
              },
              serving_name: {
                type: "string",
                description:
                  "Description of the serving, e.g. large, cup, piece"
              },
              total_serving_grams: {
                type: "number",
                description:
                  "The weight of the item eaten in grams. CANNOT BE 0"
              },
              total_serving_calories: {
                type: "number",
                description: "The number of calories in the food item"
              }
            },
            required: [
              "serving_amount",
              "serving_name",
              "total_serving_grams",
              "total_serving_calories"
            ],
            description: "Serving size and description of food item"
          }
        },
        required: [
          "full_name",
          "total_weight_grams",
          "lemmatized_database_search_term",
          "serving"
        ]
      }
    },
    total_calories: {
      type: "number",
      description: "The total calories in the meal"
    }
  },
  required: ["food_items", "total_calories"]
}

export const showDailyFoodSummarySchema = {
  type: "object",
  properties: {},
  required: []
}

export const logExerciseSchema = {
  type: "object",
  properties: {
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          exercise_name: {
            type: "string",
            description: "The name of the exercise"
          },
          primary_muscle_group: {
            type: "string",
            description: "The name of the exercise",
            enum: [
              "chest",
              "back",
              "shoulders",
              "legs",
              "arms",
              "core",
              "cardio"
            ]
          },
          weight: {
            type: "number",
            description: "The weight that was used for the exercise"
          },
          weight_units: {
            type: "number",
            description:
              "The units of the weight that was used for the exercise",
            enum: ["lbs", "kg"]
          },
          reps: {
            type: "number",
            description: "The number of reps that were performed"
          },
          exercise_time: {
            type: "number",
            description: "The number of minutes the exercise was performed for"
          },
          total_calories: {
            type: "number",
            description: "The total calories in the meal"
          }
        }
      }
    }
  },
  required: ["exercises"]
}

export const updateUserInfoSchema = {
  type: "object",
  properties: {
    users_name: {
      type: "string",
      description: "The name we should call the user"
    },
    user_date_of_birth: {
      type: "string",
      description: "The date of birth of the user. In the format YYYY-MM-DD"
    },
    users_weight: {
      type: "number",
      description: "The weight of the user in pounds"
    }
  },
  required: []
}

const exampleSchema = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          unit: {
            type: "string",
            enum: ["grams", "ml", "cups", "pieces", "teaspoons"]
          },
          amount: { type: "number" }
        },
        required: ["name", "unit", "amount"]
      }
    },
    instructions: {
      type: "array",
      description: "Steps to prepare the recipe (no numbering)",
      items: { type: "string" }
    },
    time_to_cook: {
      type: "number",
      description: "Total time to prepare the recipe in minutes"
    }
  },
  required: ["ingredients", "instructions", "time_to_cook"]
}
