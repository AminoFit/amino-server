import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { z } from "zod"
import { foodCompletion } from "@/foodResolution/model"
import { extractMessageTimePrompt } from "./extractMessageTimePrompt"
import type { Tables } from "types/supabase"

dayjs.extend(utc)
dayjs.extend(timezone)

const component=z.object({absolute_month_number:z.number().int().min(1).max(12).nullable().optional(),
  relative_months_number:z.number().int().min(-12).max(12).nullable().optional(),
  absolute_day_number:z.number().int().min(1).max(31).nullable().optional(),
  relative_days_number:z.number().int().min(-31).max(31).nullable().optional(),
  absolute_hour_number:z.number().int().min(0).max(23).nullable().optional(),
  relative_hours_number:z.number().int().min(-48).max(48).nullable().optional(),
  absolute_minutes_number:z.number().int().min(0).max(59).nullable().optional(),
  relative_minutes_number:z.number().int().min(-120).max(120).nullable().optional()})
const timeSchema=z.object({user_has_specified_time_or_date:z.boolean(),date_time_food_consumed:z.object({
  month_consumed:component.optional(),day_consumed:component.optional(),
  hour_consumed:component.optional(),minutes_consumed:component.optional()
}).optional()})

function nearbyDays(zone:string):string {
  const today=dayjs().tz(zone)
  return Array.from({length:15},(_,index)=>{
    const offset=index-7
    return `${today.add(offset,"day").format("ddd MMM D YYYY")}: ${offset} days`
  }).join("\n")
}

function consumedTime(parts:NonNullable<z.infer<typeof timeSchema>["date_time_food_consumed"]>,zone:string):Date {
  let value=dayjs().tz(zone)
  const month=parts.month_consumed
  if(month?.absolute_month_number!=null)value=value.month(month.absolute_month_number-1)
  else if(month?.relative_months_number!=null)value=value.add(month.relative_months_number,"month")
  const day=parts.day_consumed
  if(day?.absolute_day_number!=null)value=value.date(day.absolute_day_number)
  else if(day?.relative_days_number!=null)value=value.add(day.relative_days_number,"day")
  const hour=parts.hour_consumed
  if(hour?.absolute_hour_number!=null)value=value.hour(hour.absolute_hour_number)
  else if(hour?.relative_hours_number!=null)value=value.add(hour.relative_hours_number,"hour")
  const minute=parts.minutes_consumed
  if(minute?.absolute_minutes_number!=null)value=value.minute(minute.absolute_minutes_number)
  else if(minute?.relative_minutes_number!=null)value=value.add(minute.relative_minutes_number,"minute")
  return value.utc().toDate()
}

export async function getMessageTimeChat(user:Tables<"User">,message:string):Promise<{timeWasSpecified:boolean;consumedDateTime:Date|null}>{
  const prompt=extractMessageTimePrompt.prompt
    .replace("USER_INPUT_REPLACED_HERE",message)
    .replace("CURRENT_DATE_TIME",dayjs().tz(user.tzIdentifier).format("ddd MMM DD YYYY HH:mm"))
    .replace("RELATIVE_DAYS_TEXT",nearbyDays(user.tzIdentifier))
  const data=timeSchema.parse(JSON.parse(await foodCompletion({
    systemPrompt:extractMessageTimePrompt.systemPrompt,userMessage:prompt,max_tokens:700
  },user)))
  if(!data.user_has_specified_time_or_date)return {timeWasSpecified:false,consumedDateTime:null}
  if(!data.date_time_food_consumed)throw new Error("Missing inferred meal time")
  const date=consumedTime(data.date_time_food_consumed,user.tzIdentifier)
  if(!Number.isFinite(date.getTime()))throw new Error("Invalid inferred meal time")
  return {timeWasSpecified:true,consumedDateTime:date}
}
