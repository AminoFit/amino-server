import OpenAI from "openai"

export const openai = new OpenAI({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY
})

export const logFoodSchema = {
  type: "object",
  properties: {
    food_items: {
      type: "array",
      description: "An array of food items that were eaten",
      items: {
        type: "object",
        description: "A food item",
        properties: {
          food_database_search_name: {
            type: "string"
          },
          branded: {
            type: "boolean"
          },
          brand: {
            type: "string",
            default: "" // default to an empty string
          },
          serving: {
            type: "object",
            properties: {
              serving_amount: {
                type: "number",
                description: "Amount of the serving"
              },
              serving_name: {
                type: "string"
              },
              serving_g_or_ml: {
                type: "string",
                enum: ["g", "ml"]
              },
              total_serving_g_or_ml: {
                type: "number"
              }
            },
            required: ["serving_amount", "serving_name", "serving_g_or_ml", "total_serving_g_or_ml"]
          }
        },
        required: ["food_database_search_name", "branded", "brand", "serving"]
      }
    }
  },
  required: ["food_items"]
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


//console.log(JSON.stringify(logFoodSchema, null, 2))