import { NextRequest } from "next/server"
import { z } from "zod"
import { endLink, grantInput, setGrant } from "@/people/people"
import { parseBody, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }
const person = (value: string) => z.string().uuid().parse(value)

/** Changes what the user lets this person do. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return userFoodRequest(async userId => setGrant(userId, person(params.id), await parseBody(request, grantInput)))
}

/** Removes this person, silently. Each keeps copies of the other's foods they used. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => endLink(userId, person(params.id)))
}
