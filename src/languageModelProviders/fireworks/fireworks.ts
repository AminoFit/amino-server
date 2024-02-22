import { Tables } from "types/supabase"
import { LogOpenAiUsage } from "@/languageModelProviders/openai/utils/openAiHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import test from "node:test"

export interface FireworksAPIOptions {
  model?: string
  prompt: string
  systemPrompt?: string
  stop?: string
  temperature?: number
  max_tokens?: number
  prompt_truncate_len?: number
  [key: string]: any
}

export async function* fireworksChatCompletionStream(
  {
    model = "accounts/fireworks/models/mixtral-8x7b-instruct",
    systemPrompt = "You are a helpful assistant.",
    prompt,
    stop = "",
    temperature = 0.1,
    max_tokens = 200,
    prompt_truncate_len = 2048,
    ...apiOptions
  }: FireworksAPIOptions,
  user: Tables<"User">
): AsyncIterable<string> {
  const apiKey = process.env.FIREWORKS_AI_API_KEY
  const startTime = performance.now() // Record the start time

  const options = {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      top_p: 1,
      n: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: true,
      max_tokens: max_tokens,
      stop: null,
      response_format:{"type": "json_object"},
      prompt_truncate_len: prompt_truncate_len,
      model: model,
      ...apiOptions
    })
  }

  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", options)

  if (response.body) {
    const reader = response.body.getReader()
    let partialData = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder("utf-8").decode(value)
      partialData += chunk

      if (partialData.endsWith("\n\n")) {
        const messages = partialData.split("\n\n")
        for (const message of messages) {
          if (message.startsWith("data: ")) {
            const dataString = message.substring(6)
            if (dataString === "[DONE]") {
              return
            }
            try {
              const data = JSON.parse(dataString)
              if (data.usage) {
                const endTime = performance.now()
                const timeTakenMs = endTime - startTime
                LogOpenAiUsage(user, data.usage, model, "Fireworks", timeTakenMs)
                return
              }
              // console.log(data.choices[0].delta)
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                yield data.choices[0].delta.content
              }
            } catch (error) {
              console.error("Error parsing JSON:", error)
            }
          }
        }
        partialData = ""
      }
    }
  }
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase
      .from('User')
      .select('*')
      .eq('email', email);

  if (error) {
      console.error(error);
      return null;
  }

  return data;
}

const test_prompt = `
Your task is to determine based on INPUT_TO_PROCESS if a user has indicated any info relating to time or date eaten. Use the DATE to figure relative times. You can only output in JSON with the format below.

INPUT_TO_PROCESS:
"half an hour ago i had a banana with my breakfast"
DATE:
Wednesday, Feb 21, 2024, at 11:14 military time

Output Format: Your output must be in JSON format. Do not output anything else.

For each item, include details under month_consumed, day_consumed, hour_consumed, and minutes_consumed, choosing either the relative or absolute measure based on the user's input.
For relative numbers use positive numbers for days in the future and negative numbers for days in the past.
For hours use 24-hour time.
Do not include day_consumed if the user has not specified a day or the day is today.

Example Input and Outputs:

Sample 1:
Input: "i had a banana last Monday at 3pm"
Assumption: Date is Wednesday, January 24, 2024, at 15:14 military time
Reasoning: Monday is 2 days ago, and 3pm is 15:00 in military time.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": -2
    },
    "hour_consumed": {
      "absolute_hour_number": 15
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}

Sample 2:
Input: "i had a banana for lunch today"
Reasoning: Lunch is likely at 12pm. Today is today so no need to specify the day.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "hour_consumed": {
      "absolute_hour_number": 12
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}

Sample 3:
Input: "yesterday morning I ate an apple"
Reasoning: Morning is likely breakfast time, so assume 9am.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": -1
    },
    "hour_consumed": {
      "absolute_hour_number": 9
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}



Sample 4:
Input: "Tomorow for dinner i will eat some oats"
Reasoning: Tomorow for is 1 day from now and dinner is likely 7pm
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": 1
    },
    "hour_consumed": {
      "absolute_hour_number": 19
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}

Sample 5:
Input: "On Monday 15th of January 2024, I had a banana as afternoon snack"
Reasoning: User is explicit about the date. Afternoon snack is likely 3pm.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "month_consumed": {
      "absolute_month_number": 1
    },
    "day_consumed": {
      "absolute_day_number": 15
    },
    "hour_consumed": {
      "absolute_hour_number": 15
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}

Sample 6:
Input: "This coming Friday I will eat half a chicken breast"
Assumption: Date is Wednesday, January 24, 2024, at 15:14 military time)
Reasoning: Friday is 2 days from Wednesday.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": 2
    }
  }
}

Sample 7:
Input: "This afternoon i will have 100g of cheese with some crackers"
Reasoning: Day hasn't change just the time. Afternoon is likely 3pm.
Output:
{
  "user_has_specified_time_or_date": true,
  "date_time_food_consumed": {
    "hour_consumed": {
      "absolute_hour_number": 15
    },
    "minutes_consumed": {
      "absolute_minutes_number": 0
    }
  }
}

Sample 8:
Input: "With some friends i ate some pasta and grilled beef"
Reasoning: No specific date specified
Output:
{
  "user_has_specified_time_or_date": false
}


Expected JSON Output Structure:
{
  "user_has_specified_time_or_date": "boolean",
  "date_time_food_consumed"?: {
    "month_consumed"?: {
      "absolute_month_number": "number | null", 
      "relative_months_number": "number | null"
    },
    "day_consumed"?: {
      "absolute_day_number": "number | null", 
      "relative_days_number": "number | null"
    },
    "hour_consumed"?: {
      "absolute_hour_number": "number | null",
      "relative_hours_number": "number | null"
    },
    "minutes_consumed"?: {
      "absolute_minutes_number": "number | null",
      "relative_minutes_number": "number | null"
    }
  }
}
`

async function testFireworks() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))![0]
  const stream = fireworksChatCompletionStream({ 
    // model: "accounts/fireworks/models/mixtral-8x7b-instruct-hf",
    prompt: test_prompt, systemPrompt: "You are a helpful assistant that only replies with valid JSON." }, user)

  for await (const chunk of stream) {
    process.stdout.write(chunk.toString())
    // if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
    //   process.stdout.write(chunk.choices[0].delta.content);
    // }
  }
}

testFireworks()
