export const dynamic = "force-dynamic"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { createClient, CreateProjectKeySchema } from "@deepgram/sdk"
import { Tables } from "types/supabase"
const DeepgramClient = createClient(process.env.DEEPGRAM_API_KEY || "DEEPGRAM_API_KEY")

export async function POST(request: NextRequest) {
  console.log("DEEPGRAM AUTH request")

  const { aminoUser, error } = (await GetAminoUserOnRequest()) as { aminoUser: Tables<"User">; error: any }

  if (error) {
    return new Response(error, { status: 400 })
  }

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  const options: CreateProjectKeySchema = {
    comment: "Key for amino user " + aminoUser.id,
    scopes: ["usage:write"],
    time_to_live_in_seconds: 3600,
    tags: ["temp-key"],
  }
  const { result, error: keyError } = await DeepgramClient.manage.createProjectKey(process.env.DEEPGRAM_PROJECT_ID || "", options)

    if (keyError) {
        return new Response(keyError.message, { status: 400 })
    }  
  
  return NextResponse.json({ api_key_id: result.api_key_id, key: result.key })
}
