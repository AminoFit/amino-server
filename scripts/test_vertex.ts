// scripts/test_vertex.ts
import { vertexChatCompletion, vertexChatCompletionStream } from "@/languageModelProviders/vertex/chatCompletionVertex"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

async function main() {
  const args = process.argv.slice(2)
  const isStream = args.includes("--stream")

  const modelFlagIdx = args.indexOf("--model")
  const model =
    (modelFlagIdx !== -1 && args[modelFlagIdx + 1]) || process.env.VERTEX_MODEL || "gemini-2.5-flash"

  const msgFlagIdx = args.indexOf("--message")
  const userMessage =
    (msgFlagIdx !== -1 && args[msgFlagIdx + 1]) ||
    process.env.VERTEX_MESSAGE ||
    "Say hello and list three fun AI use-cases."

  const systemPrompt =
    process.env.VERTEX_SYSTEM_PROMPT || "You are a concise, helpful assistant."

  const temperature = Number(process.env.VERTEX_TEMPERATURE || "0.2")
  const maxTokens = Number(process.env.VERTEX_MAX_TOKENS || "512")
  const responseFormat = (process.env.VERTEX_RESPONSE_FORMAT || "text") as "text" | "json_object"

  const testEmail = process.env.TEST_USER_EMAIL || "seb.grubb@gmail.com"
  const user = await getUserByEmail(testEmail)
  if (!user) {
    throw new Error(
      `No user found for email ${testEmail}. Create one in Supabase or set TEST_USER_EMAIL to an existing user.`
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env.local or environment.")
  }

  console.log(`\nModel: ${model}`)
  console.log(`Mode: ${isStream ? "streaming" : "non-streaming"}`)
  console.log(`User: ${user.email}`)
  console.log("----------------------------------------\n")

  if (isStream) {
    for await (const chunk of vertexChatCompletionStream(
      {
        model,
        systemPrompt,
        userMessage,
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat
      },
      user
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } else {
    const text = await vertexChatCompletion(
      {
        model,
        systemPrompt,
        userMessage,
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat
      },
      user
    )
    console.log(text)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


