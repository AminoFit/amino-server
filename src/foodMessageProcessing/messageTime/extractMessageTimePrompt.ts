export const extractMessageTimePrompt = {
  "claude-haiku": {
    systemPrompt: "You are a helpful time extraction assistant that only replies in valid JSON.",
    prompt: `<instructions>
Your task is to determine based on input_to_process if a user has indicated any info relating to time or date eaten.
If they have your task is to extract the relative or absolute time.
datetime_now contains the current date time. You can only output in JSON with the format in output_json_schema.

IMPORTANT RULES:
1. Only include month/day/hour/minute values if user has provided details about them (e.g. if they didn't say time leave that null)
2. For relative numbers, use positive numbers for days in the future and negative numbers for days in the past.
3. Use military (24 hour) time.
4. For each item you do include (day, hour, minutes) only specify either a relative or absolute value.
5. Ignore units of time that are too small or large (like seconds years or months)
6. Use hints for time such as breakfast: 9:00, morning snack: 11:00, lunch: 12:00, afternoon snack: 15:00, dinner: 18:00 and any others where there is an approximate hour that makes sense.
6a. Don't confuse food names for times that contain references to meals unless user was clear about when they had it (e.g. "I had breakfast cereal" doesn't mean it was in the morning since thats just the food name) 
7. If the user has specified a day that IS NOT TODAY:
- Determine if it today or in the past or future based on common language or clues (I had would be in the past for e.g.)
- Using day_difference_from_today figure out what the relative day amount is. E.g. If today was Monday and user said they did something on Saturday that's 2 days ago (-2 days). In quick_reasoning VERY CLEARLY IDENTIFY which information from day_difference_from_today you are.
- If the user specified an exact day (e.g. Tuesday 3rd Jan) you can use that as absolute
</instructions>

<input_to_process>
USER_INPUT_REPLACED_HERE
</input_to_process>

<datetime_now>
CURRENT_DATE_TIME
</datetime_now>

<day_difference_from_today>
RELATIVE_DAYS_TEXT
</day_difference_from_today>

<examples>
Sample 1:
Input: "i had a banana last Sunday at 3pm"
Assumption: Date is Wednesday, January 24, 2024, at 15:14 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "Today is Wednesday and the user ate it on Saturday in the past. We read the day_difference_from_today chart and since today is Wednesday and the target is a past Saturday we see that's -4 days ago. 3pm is 15:00 in military time.",
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
Input: "five oranges and an apple"
Assumption: Date is Thursday, January 25, 2024, at 12:54 military time
Output:
{
    "user_has_specified_time_or_date": false,
    "quick_reasoning": "No time provided."
}
Sample 3:
Input: "three apples half an hour ago"
Assumption: Date is Friday, January 26, 2024, at 18:37 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "Half an hour ago is -30 minutes.",
    "date_time_food_consumed": {
      "minutes_consumed": {
        "absolute_minutes_number": -30
        }
    }
}
Sample 4:
Input: "this morning some cheese"
Assumption: Date is Saturday, January 27, 2024, at 17:22 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "This morning is today and likely around 8am.",
    "date_time_food_consumed": {
      "hour_consumed": {
        "absolute_hour_number": 8
        },
   "minutes_consumed": {
        "absolute_minutes_number": 0
    }
    }
}
</examples>

<output_json_schema>
{
    "user_has_specified_time_or_date": "boolean",
    "quick_reasoning": "string",
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
</output_json_schema>

Beginning of JSON-only output:`
  },
  "llama3-70b": {
    systemPrompt: "You are a helpful food logging assistant that only replies in valid JSON.",
    prompt: `<instructions>
Your task is to determine based on input_to_process if a user has indicated any info relating to time or date eaten.
If they have your task is to extract the relative or absolute time.
datetime_now contains the current date time. You can only output in JSON with the format in output_json_schema.

IMPORTANT RULES:
1. Only include month/day/hour/minute values if user has provided details about them (e.g. if they didn't say time leave that null)
2. For relative numbers, use positive numbers for days in the future and negative numbers for days in the past.
3. Use military (24 hour) time.
4. For each item you do include (day, hour, minutes) only specify either a relative or absolute value.
5. Ignore units of time that are too small or large (like seconds years or months)
6. Use hints for time such as breakfast: 9:00, morning snack: 11:00, lunch: 12:00, afternoon snack: 15:00, dinner: 18:00 and any others where there is an approximate hour that makes sense.
6a. Don't confuse food names for times that contain references to meals unless user was clear about when they had it (e.g. "I had breakfast cereal" doesn't mean it was in the morning since thats just the food name) 
7. If the user has specified a day:
- Determine if it is in the past or future based on common language or clues (I had would be in the past for e.g.)
- Using day_difference_from_today figure out what the relative day amount is. E.g. If today was Monday and user said they did something on Saturday that's 2 days ago (-2 days). In quick_reasoning VERY CLEARLY IDENTIFY which information from day_difference_from_today you are.
- If the user specified an exact day (e.g. Tuesday 3rd Jan) you can use that as absolute
</instructions>

<input_to_process>
USER_INPUT_REPLACED_HERE
</input_to_process>

<datetime_now>
CURRENT_DATE_TIME
</datetime_now>

<day_difference_from_today>
RELATIVE_DAYS_TEXT
</day_difference_from_today>

<examples>
Sample 1:
Input: "i had a banana last Sunday at 3pm"
Assumption: Date is Wednesday, January 24, 2024, at 15:14 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "Today is Wednesday and the user ate it on Saturday in the past. We read the day_difference_from_today chart and since today is Wednesday and the target is a past Saturday we see that's -4 days ago. 3pm is 15:00 in military time.",
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
Input: "five oranges and an apple"
Assumption: Date is Thursday, January 25, 2024, at 12:54 military time
Output:
{
    "user_has_specified_time_or_date": false,
    "quick_reasoning": "No time provided."
}
Sample 3:
Input: "three apples half an hour ago"
Assumption: Date is Friday, January 26, 2024, at 18:37 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "Half an hour ago is -30 minutes.",
    "date_time_food_consumed": {
      "minutes_consumed": {
        "absolute_minutes_number": -30
        }
    }
}  
Sample 4:
Input: "this morning some cheese"
Assumption: Date is Saturday, January 27, 2024, at 17:22 military time
Output:
{
    "user_has_specified_time_or_date": true,
    "quick_reasoning": "This morning is today and likely around 8am.",
    "date_time_food_consumed": {
      "hour_consumed": {
        "absolute_hour_number": 8
        },
   "minutes_consumed": {
        "absolute_minutes_number": 0
    }
    }
}  
</examples>

<output_json_schema>
{
    "user_has_specified_time_or_date": "boolean",
    "quick_reasoning": "string",
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
</output_json_schema>

Beginning of JSON-only output:`
  },
  "gpt-3.5-turbo": {
    systemPrompt: "You are a helpful food logging assistant that only replies in valid JSON.",
    prompt: `Your task is to determine based on INPUT_TO_PROCESS if a user has indicated any info relating to time or date eaten. Use the DATE_NOW if you need to use a time. You can only output in JSON with the format below.

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

Expected JSON Output Structure:
{
    "user_has_specified_time_or_date": "boolean",
    "quick_reasoning"?: "string",
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
}`
  }
}
