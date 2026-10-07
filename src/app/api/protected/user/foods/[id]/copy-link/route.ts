import { NextRequest } from "next/server"
import { createCopyLink, revokeCopyLinks } from "@/people/sharing"
import { idParam, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { id: string } }

/** A link anyone can use to add their own copy of this food. */
export async function POST(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => createCopyLink(userId, idParam(params.id)), 201)
}

/** Turns off this food's copy links. Copies people already made stay theirs. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => revokeCopyLinks(userId, idParam(params.id)))
}
