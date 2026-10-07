import { NextRequest } from "next/server"
import { z } from "zod"
import { block, unblock } from "@/people/people"
import { userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }
const person = (value: string) => z.string().uuid().parse(value)

export async function POST(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => block(userId, person(params.id)))
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => unblock(userId, person(params.id)))
}
