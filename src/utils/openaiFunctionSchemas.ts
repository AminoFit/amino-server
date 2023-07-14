import { Configuration, OpenAIApi } from "openai"
const configuration = new Configuration({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY
})
export const openai = new OpenAIApi(configuration)

export const logFoodSchema = {
  type: "object",
  description: "A function that logs the food items that were eaten by a user",
  properties: {
    food_items: {
      type: "array",
      description: "An array of food items that were eaten",
      items: {
        type: "object",
        description: "A food item",
        properties: {
          name: { type: "string",
            description: "The name of the food item" },
          database_search_term: { type: "string",
            description: "Basic terms to search for in a database (e.g. apple instead of large apple)" },
          unit: {
            type: "string",
            enum: ["g", "ml", "cups", "piece", "tbsp", "tsp"],
          },
          serving_amount: { type: "number",
            description: "The serving amount (ideally grams) of the food item that was eaten" },
          calories: { type: "number",
            description: "The number of calories in the food item" },
        },
        required: [
          "name",
          "unit",
          "serving_amount",
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
