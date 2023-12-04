// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { forceGenerateNewFoodIconQueue } from "../generate-food-icon/generate-food-icon"

export const POST = forceGenerateNewFoodIconQueue
