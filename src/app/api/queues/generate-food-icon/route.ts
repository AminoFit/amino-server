// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { generateFoodIconQueue } from "./generate-food-icon"

export const POST = generateFoodIconQueue
