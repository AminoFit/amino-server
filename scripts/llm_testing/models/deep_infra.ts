import axios, { AxiosRequestConfig } from "axios"
import dotenv from "dotenv"

// Load environment variables from .env.prod file
dotenv.config({ path: ".env.prod" })

async function callDeepInfraAPI(
  messageContent: string,
  enableStream = false,
  model: string = "mistralai/Mixtral-8x7B-Instruct-v0.1"
) {
  const API_KEY = process.env.DEEP_INFRA_API_KEY

  const config: AxiosRequestConfig = {
    method: "post",
    url: "https://api.deepinfra.com/v1/openai/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    data: {
      model: model,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 4096,
      ...(enableStream && { stream: true })
    },
    responseType: "stream"
  }

  try {
    const response = await axios(config)
    if (enableStream) {
      let tokenCount = 0
      let accumulatedData = ""
      const startTime = Date.now()

      response.data.on("data", (chunk: any) => {
        accumulatedData += chunk.toString()
        const lines = accumulatedData.split("\n")

        if (lines.length > 1) {
          // Process and output each complete line
          process.stdout.write(lines.toString() || "")
          // process.stdout.write(lines[0].match(/"content": "(.*?)"/)?.[1]?.toString() || "")
          accumulatedData = lines[1]
        }

        tokenCount++
      })

      return new Promise((resolve) => {
        response.data.on("end", () => {
          const endTime = Date.now()
          const durationInSeconds = (endTime - startTime) / 1000
          const tokensPerSecond = tokenCount / durationInSeconds
          resolve({ tokenCount, durationInSeconds, tokensPerSecond })
        })
      })
    } else {
      // Non-streaming response handling
      let responseData = ""
      response.data.on("data", (chunk: any) => (responseData += chunk))
      return new Promise((resolve) => {
        response.data.on("end", () => {
          const data = JSON.parse(responseData)
          resolve(data)
        })
      })
    }
  } catch (error) {
    console.error("Error:", error)
    return Promise.reject(error)
  }
}

export default callDeepInfraAPI
