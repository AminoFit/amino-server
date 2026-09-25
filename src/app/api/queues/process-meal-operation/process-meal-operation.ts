import { Queue } from "quirrel/next-app"
import { processMealOperation } from "@/mealOperations/worker"

export const processMealOperationQueue=Queue("api/queues/process-meal-operation",
  async (operationId:string)=>{await processMealOperation(operationId)})
