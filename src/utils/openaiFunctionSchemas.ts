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
          full_item_user_message_including_serving: {  // New field added
            type: "string"
          },
          branded: {
            type: "boolean"
          },
          brand: {
            type: "string",
            default: "" // default to an empty string
          },
        },
        required: ["food_database_search_name", "full_item_user_message_including_serving", "branded", "brand"]
      }
    }
  },
  required: ["food_items"]
}

export const extractServingAmount = {
  "type": "object",
  "properties": {
    "serving_unit_in_user_message": {
      "type": "string",
      "description": "Unit of serving provided in the user_message such as a serving of a weight/volume amount"
    },
    "serving_amount_in_user_message": {
      "type": "number",
      "description": "Amount of serving provided in the user_message"
    },
    "serving_id_match_to_user_message": {
      "type": "integer",
      "description": "ID of the serving that matches the user's message"
    },
    "user_serving_total_weight_equation_g_or_ml": {
      "type": "string",
      "description": "Equation to calculate total weight in g or ml. e.g. 1 * 3 or 1/3 * 3.1 etc"
    },
    "user_serving_total_weight_estimate_g_or_ml": {
      "type": "number",
      "description": "Estimated total weight in g or ml provided by the user, rounded"
    },
    "unit_g_or_ml": {
      "enum": [
        "g",
        "ml"
      ],
      "type": "string",
      "description": "use g if weight or ml if volume/liquid"
    }
  },
  "required": [
    "serving_unit_in_user_message",
    "serving_amount_in_user_message",
    "user_serving_total_weight_equation_g_or_ml",
    "user_serving_total_weight_estimate_g_or_ml",
    "unit_g_or_ml"
  ]
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


//console.log(JSON.stringify(extractServingAmount, null, 2))