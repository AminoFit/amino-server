// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { processFoodItemQueue } from "./process-food-item"

export const POST = processFoodItemQueue
