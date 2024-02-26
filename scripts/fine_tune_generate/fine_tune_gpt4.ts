import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"

const prompt = `Generate 10 sample user food log request similar to these examples:
"at 7am for breakfast I had 1 cup of rice"
"at lunch I had 2 slices of pizza"
"yesterday for dinner I had 1/2 cup of pasta"
"for a snack I had 1 apple"
"for breakfast I had 1/2 cup of oatmeal"
i.e. we want  many examples that contain either no reference to time, some relative time, or a specific time.

e.g. today, yesterday, tomorow this weekend, last week on sunday etc are all relative
on monday, on sat 12th, at 7am, at 3pm, at 10pm are all specific

output 10 newer samples in this JSON format:
[{ "user_message": "string" }]`

async function generateSamplePrompt() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const messages = [
    {
      role: "system",
      content: "You are a helpful assistant that generates samples for fine tuning"
    },
    {
      role: "user",
      content: prompt
    }
  ] as OpenAI.Chat.ChatCompletionMessageParam[]
  const model = "gpt-4-0125-preview"
  const temperature = 0.0
  const max_tokens = 2048
  const result = await chatCompletion(
    { messages, model, temperature, max_tokens, response_format: "json_object" },
    user!
  )
  console.log(result)
}

generateSamplePrompt()
