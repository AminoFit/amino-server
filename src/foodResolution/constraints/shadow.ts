import { currentFoodConfig, foodMetric } from "../telemetry"
import type { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { hasNutritionStatement } from "./contract"

export async function shadowNutritionConstraints(text:string,items:FoodItemToLog[]):Promise<void>{
  if(currentFoodConfig()?.features.nutrition_constraints!=="shadow"||!hasNutritionStatement(text))return
  try{
    const result=await (await import("./extract")).extractNutritionPlan(text,items)
    foodMetric("nutrition_constraints_shadow",result.durationMs,result.status==="valid"?"ok":"error",{
      status:result.status,model:result.model,promptTokens:result.promptTokens,completionTokens:result.completionTokens,costUsd:result.costUsd,
      nutritionClaimCount:result.plan?.claims.length,
      nutritionIdentityCount:result.plan?.claims.filter(c=>c.purpose==="identity").length,
      nutritionPortionCount:result.plan?.claims.filter(c=>c.purpose==="portion").length,
      nutritionGroupCount:result.plan?.claims.filter(c=>c.purpose==="meal_total").length
    })
  }catch{/* A shadow interpretation cannot change queueing, food values or response status. */}
}
