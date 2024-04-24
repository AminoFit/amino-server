import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiChatCompletionJsonStream,
  ChatCompletionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { extractMessageTimePrompt } from "./extractMessageTimePrompt"
import { getUserByEmail } from "../common/debugHelper"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { claudeChatCompletionStream } from "@/languageModelProviders/anthropic/anthropicChatCompletion"
import { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages"
// Extend dayjs with the plugins
dayjs.extend(utc)
dayjs.extend(timezone)

async function* processMessageTimeExtractStreamOpenAi(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  // Call ChatCompletionJsonStream to get the stream
  let model = "ft:gpt-3.5-turbo-1106:hedge-labs::8utlaQAo"
  // append model to options
  options.model = model
  const stream = await OpenAiChatCompletionJsonStream(user, options)

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    process.stdout.write(chunk)
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

async function* processMessageTimeExtractStreamAnthropic(
  user: Tables<"User">,
  options: MessageCreateParamsBase,
  prompt: string
) {
  let model = "claude-3-haiku"
  const stream = await claudeChatCompletionStream(
    {
      messages: [
        {
          role: "user",
          content: prompt
        },
        { role: "assistant", content: "{" }
      ],
      model: model,
      temperature: 0,
      max_tokens: 250,
      system: extractMessageTimePrompt["claude-haiku"].systemPrompt
    },
    user
  )
  let buffer = "{" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    process.stdout.write(chunk)
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

function relativeDaysText(): string {
  const currentDate = new Date()
  const daysArray = []
  for (let i = -7; i <= 7; i++) {
    const newDate = new Date(currentDate.getTime() + i * 24 * 60 * 60 * 1000)
    const dayOfWeek = newDate.toLocaleString("en-US", { weekday: "long" })
    const month = newDate.toLocaleString("en-US", { month: "long" })
    const dayOfMonth = newDate.getDate()
    const year = newDate.getFullYear()

    let relationship
    if (i === 0) {
      relationship = "(Today)"
    } else if (i > 0) {
      relationship = i === 1 ? "1 day from now" : `${i} days from now`
    } else {
      relationship = i === -1 ? "-1 day ago" : `${i} days ago`
    }

    daysArray.push(`${dayOfWeek}, ${month} ${dayOfMonth}, ${year}: ${relationship}`)
  }
  return daysArray.join("\n")
}

function extractLatestValidJSON(inputString: string) {
  let braceCount = 0
  let endIndex = -1

  // Start from the end of the string and look for the first closing brace
  for (let i = inputString.length - 1; i >= 0; i--) {
    if (inputString[i] === "}") {
      if (braceCount === 0) {
        // This is the end of the latest JSON object
        endIndex = i
      }
      braceCount++
    } else if (inputString[i] === "{") {
      braceCount--
      if (braceCount === 0) {
        // Found the start of the latest JSON object
        const jsonStr = inputString.substring(i, endIndex + 1)
        try {
          const jsonObj = JSON.parse(jsonStr)
          return { jsonObj, endIndex } // Return both the object and the end index
        } catch (e) {
          console.error("Failed to parse JSON:", e)
          return { jsonObj: null, endIndex: -1 }
        }
      }
    }
  }

  return { jsonObj: null, endIndex: -1 } // Return null if no well-formed JSON object is found
}

interface DateTimeFoodConsumed {
  month_consumed?: {
    absolute_month_number?: number | null
    relative_months_number?: number | null
  }
  day_consumed?: {
    absolute_day_number?: number | null
    relative_days_number?: number | null
  }
  hour_consumed?: {
    absolute_hour_number?: number | null
    relative_hours_number?: number | null
  }
  minutes_consumed?: {
    absolute_minutes_number?: number | null
    relative_minutes_number?: number | null
  }
}

interface FoodConsumptionDetails {
  user_has_specified_time_or_date: boolean
  quick_reasoning?: string
  date_time_food_consumed?: DateTimeFoodConsumed
}

function transformCurrentDateTime(changeValues: DateTimeFoodConsumed, timezone: string): Date {
  // Convert the current UTC time to the user's local timezone
  let result = dayjs().tz(timezone)

  if (changeValues.month_consumed) {
    if (changeValues.month_consumed.absolute_month_number != null) {
      // Changed !== to != to also check for undefined
      result = result.set("month", changeValues.month_consumed.absolute_month_number - 1)
    } else if (changeValues.month_consumed.relative_months_number != null) {
      result = result.add(changeValues.month_consumed.relative_months_number, "month")
    }
  }

  if (changeValues.day_consumed) {
    if (changeValues.day_consumed.absolute_day_number != null) {
      result = result.set("date", changeValues.day_consumed.absolute_day_number)
    } else if (changeValues.day_consumed.relative_days_number != null) {
      result = result.add(changeValues.day_consumed.relative_days_number, "day")
    }
  }

  if (changeValues.hour_consumed) {
    if (changeValues.hour_consumed.absolute_hour_number != null) {
      result = result.set("hour", changeValues.hour_consumed.absolute_hour_number)
    } else if (changeValues.hour_consumed.relative_hours_number != null) {
      result = result.add(changeValues.hour_consumed.relative_hours_number, "hour")
    }
  }

  if (changeValues.minutes_consumed) {
    if (changeValues.minutes_consumed.absolute_minutes_number != null) {
      result = result.set("minute", changeValues.minutes_consumed.absolute_minutes_number)
    } else if (changeValues.minutes_consumed.relative_minutes_number != null) {
      result = result.add(changeValues.minutes_consumed.relative_minutes_number, "minute")
    }
  }

  // Convert back to UTC to get the correct UTC time after all adjustments
  let utcResult = result.utc()

  return utcResult.toDate()
}

export async function getMessageTimeChat(
  user: Tables<"User">,
  user_message: string
): Promise<{ timeWasSpecified: boolean; consumedDateTime: Date | null }> {
  // if (user_message.status === "FAILED") {
  //   model = "gpt-4-1106-preview"
  // }

  const formattedDateTime = dayjs().tz(user.tzIdentifier).format("ddd MMM DD YYYY HH:mm")

  const requestPrompt = extractMessageTimePrompt["claude-haiku"].prompt
    .replace("USER_INPUT_REPLACED_HERE", user_message)
    .replace("CURRENT_DATE_TIME", formattedDateTime)
    .replace("RELATIVE_DAYS_TEXT", relativeDaysText())

  console.log(requestPrompt)

  // const stream = processMessageTimeExtractStreamOpenAi(user, {
  //   prompt: requestPrompt,
  //   temperature: 0,
  //   max_tokens: 250,
  //   systemPrompt: extractMessageTimePrompt["claude-haiku"].systemPrompt
  // })

  const stream = processMessageTimeExtractStreamAnthropic(user, {
    temperature: 0,
    messages:[],
    model: "claude-3-haiku",
    max_tokens: 250,
    system: extractMessageTimePrompt["claude-haiku"].systemPrompt
  }, requestPrompt)

  let timeWasSpecified = false
  let consumedDateTime: Date | null = null

  for await (const chunk of stream) {
    if (chunk.hasOwnProperty("date_time_food_consumed")) {
      return {
        timeWasSpecified: true,
        consumedDateTime: transformCurrentDateTime(chunk.date_time_food_consumed, user.tzIdentifier)
      }
    } else if (chunk.hasOwnProperty("user_has_specified_time_or_date")) {
      timeWasSpecified = chunk.user_has_specified_time_or_date
      if (timeWasSpecified == false) {
        return { timeWasSpecified, consumedDateTime: null }
      }
    }
  }

  return { timeWasSpecified, consumedDateTime }
}

async function testChatCompletionJsonStream() {
  const supabase = createAdminSupabase()
  const user = await getUserByEmail("seb.grubb@gmail.com")
  // const userMessage = "Two apples with a latte from starbucks with 2% milk and 3 waffles with butter and maple syrup"
  // // Make sure to include all required fields in your insert object
  // const insertObject = {
  //   content: userMessage,
  //   userId: user![0].id,
  //   role: "User",
  //   messageType: "FOOD_LOG_REQUEST",
  //   createdAt: new Date().toISOString(),
  //   function_name: null,
  //   hasimages: false,
  //   itemsProcessed: 0,
  //   itemsToProcess: 0,
  //   local_id: null,
  //   resolvedAt: null,
  //   status: "RECEIVED"
  // } as Tables<"Message">

  // const { data, error } = await supabase.from("Message").insert([insertObject]).select()
  //   const {data, error} = await supabase.from("Message").select("*").eq("id", 997)
  //   const message = data![0] as Tables<"Message">
  const message = {
    id: 997,
    createdAt: new Date().toISOString(),
    content: "for breakfast yesterday i had an apple",//"This morning around 7AM, I had some bok choy,",
    function_name: null,
    role: "User",
    userId: "uuid-of-the-user",
    itemsProcessed: 0,
    itemsToProcess: 0,
    messageType: "FOOD_LOG_REQUEST",
    resolvedAt: null,
    status: "RECEIVED",
    local_id: null,
    hasimages: false,
    isAudio: false,
    isBadFoodRequest: null,
    consumedOn: null,
    deletedAt: null
  } as Tables<"Message">
  const startTime = new Date()
  const result = await getMessageTimeChat(user!, message.content)
  const endTime = new Date()
  console.log("Time taken in milliseconds:", endTime.getTime() - startTime.getTime())
  //format result date to user timezone
  // have it be in format Wed Jan 23 20204 11:14:00 GMT-0500 (Eastern Standard Time)
  console.log(result)
  if (result.consumedDateTime) {
    console.log(dayjs(result.consumedDateTime).tz(user!.tzIdentifier).format("ddd MMM DD YYYY HH:mm:ss [GMT]Z (z)"))
    console.log("datenow", dayjs().tz(user!.tzIdentifier).format("ddd MMM DD YYYY HH:mm:ss [GMT]Z (z)"))
  }
}

async function testFoodLoggingStream() {
  // const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
}

function testTimezone() {
  const transformObject: DateTimeFoodConsumed = {
    day_consumed: {
      relative_days_number: -1
    },
    hour_consumed: {
      absolute_hour_number: 23
    },
    minutes_consumed: {
      absolute_minutes_number: 30
    }
  }
  transformCurrentDateTime(transformObject, "America/New_York")
}

// testTimezone()
// testChatCompletionJsonStream()
