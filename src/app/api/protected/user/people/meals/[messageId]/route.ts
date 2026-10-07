import { NextRequest } from "next/server"
import { deleteMealLoggedFor } from "@/people/people"
import { idParam, userFoodRequest } from "@/userFoods/http"

export const dynamic = "force-dynamic"
type Params = { params: { messageId: string } }

/** Deletes a meal the user logged for someone, while they may still log for them. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return userFoodRequest(userId => deleteMealLoggedFor(userId, idParam(params.messageId)))
}
