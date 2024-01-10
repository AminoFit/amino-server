export const dynamic = "force-dynamic"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { createClient, CreateProjectKeySchema, CreateProjectKeyResponse } from "@deepgram/sdk"
import { Tables } from "types/supabase"
const DeepgramClient = createClient(process.env.DEEPGRAM_API_KEY || "DEEPGRAM_API_KEY")

interface ExtendedCreateProjectKeyResponse extends CreateProjectKeyResponse {
    expiration_date?: string;
}

export async function POST(request: NextRequest) {
  console.log("DEEPGRAM AUTH request")

  const { aminoUser, error } = (await GetAminoUserOnRequest()) as { aminoUser: Tables<"User">; error: any }

  if (error) {
    return new Response('error:' + error, { status: 400 })
  }

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  const options: CreateProjectKeySchema = {
    comment: "Key for amino user " + aminoUser.id,
    scopes: ["usage:write"],
    time_to_live_in_seconds: 600,
    tags: ["temp-key"]
  }
  const { result, error: keyError } = await DeepgramClient.manage.createProjectKey(
    process.env.DEEPGRAM_PROJECT_ID || "",
    options
  )

  if (keyError) {
    return new Response(keyError.message, { status: 400 })
  }

  // if result has a expiration_date field, also return that
  if ((result as ExtendedCreateProjectKeyResponse).expiration_date) {
    return NextResponse.json({
      api_key_id: result.api_key_id,
      key: result.key,
      expiration_date: (result as ExtendedCreateProjectKeyResponse).expiration_date
    })
  }

  return NextResponse.json({ api_key_id: result.api_key_id, key: result.key })
}

async function test() {
  const options: CreateProjectKeySchema = {
    comment: "Key for amino user " + "TEMP",
    scopes: ["usage:write"],
    time_to_live_in_seconds: 600,
    tags: ["temp-key"]
  }
  const { result, error: keyError } = await DeepgramClient.manage.createProjectKey(
    process.env.DEEPGRAM_PROJECT_ID || "",
    options
  )

  if (keyError) {
    return new Response(keyError.message, { status: 400 })
  }
  if ((result as ExtendedCreateProjectKeyResponse).expiration_date) {
    console.log("result!", result)
    return
  }
  console.log("result", result)
}

