import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import axios from "axios"

import * as path from "path"
require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env.local")
})

async function storeAccessToken(apiName: string, token: string, expiresIn: number) {
  const expires = new Date(Date.now() + expiresIn * 1000).toISOString()

  const supabase = createAdminSupabase()

  await supabase.from("ApiTokens").insert({
    apiName,
    token,
    expires
  })
}

async function getStoredAccessToken(apiName: string): Promise<string | null> {
  const supabase = createAdminSupabase()

  const { data: tokenRecord } = await supabase
    .from("ApiTokens")
    .select()
    .eq("apiName", apiName)
    .gt("expires", new Date())
    .single()

  return tokenRecord?.token || null
}

export async function getFsAccessToken(): Promise<string> {
  const apiName = "FatSecret"
  let debug = false
  try {
    const storedToken = await getStoredAccessToken(apiName)
    if (storedToken) return storedToken
  } catch (err) {
    debug = true
    console.error("Failed to get stored access token, we are likely on debug mode")
  }
  const clientID = process.env.FATSECRET_CLIENT_ID
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET
  if (!clientID || !clientSecret) {
    throw new Error("Client ID or Client Secret is not defined")
  }

  const options = {
    method: "POST",
    url: "https://oauth.fatsecret.com/connect/token",
    auth: {
      username: clientID,
      password: clientSecret
    },
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: "grant_type=client_credentials&scope=premier"
  }

  try {
    const response = await axios(options)
    const { access_token: token, expires_in: expiresIn } = response.data
    if (!debug) {
      await storeAccessToken(apiName, token, expiresIn)
    }
    return token
  } catch (err) {
    const error = err as {
      message: string
      config: any
      request: any
      response?: { data: any; status: any; headers: any }
    }
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data)
      console.log(error.response.status)
      console.log(error.response.headers)
    } else if (error.request) {
      // The request was made but no response was received
      console.log(error.request)
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message)
    }
    console.error(error.config)
    throw new Error("Failed to obtain access token")
  }
}

//   async function runTest(){
//     const token = await getFsAccessToken()
//     console.log(token)
//   }

//   runTest()
