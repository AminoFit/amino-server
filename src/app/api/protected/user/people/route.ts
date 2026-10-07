import { NextRequest } from "next/server"
import { listPeople } from "@/people/people"
import { userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"

/** Linked people (with each side's grants), requests waiting for an answer, and blocked people. */
export async function GET(_request: NextRequest) {
  return userFoodRequest(userId => listPeople(userId))
}
