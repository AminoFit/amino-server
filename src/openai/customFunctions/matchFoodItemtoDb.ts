const matchFoodItemToDatatbaseSchema = {
  type: 'object',
  properties: {
    user_food_name: { type: 'string' },
    closest_food_in_db: { type: 'string' },
    closest_food_id: { type: 'number' },
    user_and_db_same_food: { type: 'boolean' },
    certainty_0_to_1: { type: 'number' }
  },
  required: [
    'closest_food_in_db',
    'user_and_db_same_food',
    'closest_food_id',
    'matched_db_id',
    'certainty_0_to_1'
  ]
}


  console.dir(matchFoodItemToDatatbaseSchema, {depth: null})