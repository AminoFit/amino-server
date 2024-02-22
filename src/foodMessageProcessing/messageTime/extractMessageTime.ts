import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiChatCompletionJsonStream,
  ChatCompletionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"

import { getUserByEmail } from "../common/debugHelper"
import dayjs from "dayjs"
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
// Extend dayjs with the plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const date_find_prompt = `
Your task is to determine based on INPUT_TO_PROCESS if a user has indicated any info relating to time or date eaten. Use the DATE_NOW if you need to use a time. You can only output in JSON with the format below.

IMPORTANT RULES:
1. Only include day/hour/minute values if user has provided some details about them (e.g. if they didn't say time leave that null)
2. For relative numbers, use positive numbers for days in the future and negative numbers for days in the past.
3. For hours use 24-hour time.
4. For each item you do include (day, hour, minutes) only specify either a relative or absolute value.
5. Feel free to ignore units of time that are too small or large (like seconds years or months)
6. You can use hints for time such as breakfast: 9:00, morning snack: 11:00, lunch: 12:00, afternoon snack: 15:00, dinner: 18:00 and any others where there is an approximate hour that makes sense
7. Don't confuse food names for times that contain references to meals unless user was clear about when they had it (e.g. "I had breakfast cereal" doesn't mean it was in the morning since thats just the food name) 
8. For relative days use current date as the reference point. E.g. if today is Saturday and user says Thursday that would be -2 days ago.


INPUT_TO_PROCESS:
"USER_INPUT_REPLACED_HERE"
DATE_NOW:
CURRENT_DATE_TIME

Output Format: Your output must be in JSON format. Do not output anything else.

Example Input and Outputs:

Sample 1:
Input: "i had a banana last Saturday at 3pm"
Assumption: Date is Wednesday, January 24, 2024, at 15:14 military time
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "Saturday is 6th day of the week and Wednesday is the 10th (since it is after) so it is 4 days ago. 3pm is 15:00 in military time.",
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": -4
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
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "Lunch is likely at 12pm. Today is today so no need to specify the day.",
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": null
    },
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
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "yesterday is 1 day from now and breakfast is likely 9am.",
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
Input: "Tomorrow for dinner i will eat some oats"
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "Tomorrow is 1 day from now and dinner is likely 7pm.",
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
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "User is explicit about the date. Afternoon snack is likely 3pm.",
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
Assumption: Date is Wednesday, January 24, 2024, at 15:14
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "Wednesday is 3rd day of the week and Friday is the 5th day of the week. So that would be 2 days from now.",
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": 2
    }
  }
}

Sample 6:
Input: "Saturday I had some grapes"
Assumption: Date is Sunday, January 18, 2025, at 11:23
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "user said 'had' so it is in the past. Saturday is 6th day of the week and Sunday is the 7th day of the week. So that would be -1 days from now.",
  "date_time_food_consumed": {
    "day_consumed": {
      "relative_days_number": -1
    }
  }
}

Sample 7:
Input: "Three and half hours ago i had 100g of cheese with some crackers"
Output:
{
  "user_has_specified_time_or_date": true,
  "quick_reasoning": "thats -3 hours and -30 minutes ago",
  "date_time_food_consumed": {
    "hour_consumed": {
      "relative_hours_number": -3
    },
    "minutes_consumed": {
      "relative_minutes_number": -30
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

Some quick reminder of how to calculate relative days:
We can index days of the week like this:
0: Sunday
1: Monday
2: Tuesday
3: Wednesday
4: Thursday
5: Friday
6: Saturday
7: Sunday
8: Monday
9: Tuesday
10: Wednesday
11: Thursday
12: Friday
13: Saturday
etc.

So if user says "this coming Friday" and today is Wednesday, that would be 2 days from now.

Expected JSON Output Structure:
{
  "user_has_specified_time_or_date": "boolean",
  "quick_reasoning"?: "string",
  "date_time_food_consumed"?: {
    "month_consumed"?: {
      "absolute_month_number": "number | null", 
      "relative_months_number": "number | null"
    },
"day_absolute_or_relative_specified":"boolean",
    "day_consumed"?: {
      "absolute_day_number": "number | null", 
      "relative_days_number": "number | null"
    },
"hour_absolute_or_relative_specified":"boolean",
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

async function* processMessageTimeExtractStream(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  // Call ChatCompletionJsonStream to get the stream
  const stream = await OpenAiChatCompletionJsonStream(user, options)

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
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
    let result = dayjs().tz(timezone);

    if (changeValues.month_consumed) {
        if (changeValues.month_consumed.absolute_month_number != null) { // Changed !== to != to also check for undefined
            result = result.set('month', changeValues.month_consumed.absolute_month_number - 1);
        } else if (changeValues.month_consumed.relative_months_number != null) {
            result = result.add(changeValues.month_consumed.relative_months_number, 'month');
        }
    }

    if (changeValues.day_consumed) {
        if (changeValues.day_consumed.absolute_day_number != null) {
            result = result.set('date', changeValues.day_consumed.absolute_day_number);
        } else if (changeValues.day_consumed.relative_days_number != null) {
            result = result.add(changeValues.day_consumed.relative_days_number, 'day');
        }
    }

    if (changeValues.hour_consumed) {
        if (changeValues.hour_consumed.absolute_hour_number != null) {
            result = result.set('hour', changeValues.hour_consumed.absolute_hour_number);
        } else if (changeValues.hour_consumed.relative_hours_number != null) {
            result = result.add(changeValues.hour_consumed.relative_hours_number, 'hour');
        }
    }

    if (changeValues.minutes_consumed) {
        if (changeValues.minutes_consumed.absolute_minutes_number != null) {
            result = result.set('minute', changeValues.minutes_consumed.absolute_minutes_number);
        } else if (changeValues.minutes_consumed.relative_minutes_number != null) {
            result = result.add(changeValues.minutes_consumed.relative_minutes_number, 'minute');
        }
    }

    // Convert back to UTC to get the correct UTC time after all adjustments
    let utcResult = result.utc();


    return utcResult.toDate();
}

export async function getMessageTimeChat(
  user: Tables<"User">,
  user_message: Tables<"Message">,
  consumedOn: Date = new Date()
): Promise<{ timeWasSpecified: boolean; consumedDateTime: Date | null }> {

  let model = "ft:gpt-3.5-turbo-1106:hedge-labs::8utlaQAo"
  // if (user_message.status === "FAILED") {
  //   model = "gpt-4-1106-preview"
  // }

  const formattedDateTime = dayjs().tz(user.tzIdentifier).format("ddd MMM DD YYYY HH:mm")

  const requestPrompt = date_find_prompt
    .replace("USER_INPUT_REPLACED_HERE", user_message.content)
    .replace("CURRENT_DATE_TIME", formattedDateTime)

  const stream = processMessageTimeExtractStream(user, {
    prompt: requestPrompt,
    temperature: 0.1,
    model: model,
    systemPrompt: "You are a helpful time assistant that outputs the absolute or relative time a user is specifying in JSON."
  })

  let timeWasSpecified = false
  let consumedDateTime: Date | null = null

  for await (const chunk of stream) {
    if (chunk.hasOwnProperty("date_time_food_consumed")) {
        return { timeWasSpecified: true, consumedDateTime: transformCurrentDateTime(chunk.date_time_food_consumed, user.tzIdentifier) }
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
    content: "yesterdya i had a banana for lunchtime",
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
  const result = await getMessageTimeChat(user!, message)
  //format result date to user timezone
  // have it be in format Wed Jan 23 20204 11:14:00 GMT-0500 (Eastern Standard Time)
  console.log(result)
  if (result.consumedDateTime) {
  console.log(dayjs(result.consumedDateTime).tz(user!.tzIdentifier).format("ddd MMM DD YYYY HH:mm:ss [GMT]Z (z)"))
  console.log('datenow', dayjs().tz(user!.tzIdentifier).format("ddd MMM DD YYYY HH:mm:ss [GMT]Z (z)"))
  }
}

async function testFoodLoggingStream() {
  // const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
}

function testTimezone()
{

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
      };
    transformCurrentDateTime(transformObject, "America/New_York")
}

// testTimezone()
// testChatCompletionJsonStream()
