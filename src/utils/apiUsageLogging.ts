import { createAdminSupabase } from "./supabase/serverAdmin"

export async function checkRateLimit(apiName: string, maxCount: number, timeFrame: number): Promise<boolean> {
  // Chris TODO

  let currentTime = new Date()
  let pastTime = new Date(currentTime.getTime() - timeFrame)

  const supabase = createAdminSupabase()

  const { data, error } = await supabase
    .from('ApiCalls')
    .select('count')
    .eq('apiName', apiName)
    .gte('timestamp', pastTime.toISOString())
    .lt('timestamp', currentTime.toISOString())

  if (error) {
    console.error('Error fetching API calls:', error)
    return false
  }

  let total = data?.reduce((sum, record) => sum + record.count, 0) || 0

  return total < maxCount
}

export async function recordQuery(apiName: string, queryType: string) {
  let bucketStartTime = new Date()
  bucketStartTime.setMinutes(0, 0, 0) // Bucketing by the hour

  const supabase = createAdminSupabase()

  const { data, error } = await supabase
    .from("ApiCalls")
    .select("*")
    .eq("apiName", apiName)
    .eq("queryType", queryType)
    .eq("timestamp", bucketStartTime.toISOString())
    .single()

  if (data) {
    await supabase
      .from("ApiCalls")
      .update({
        count: data.count + 1
      })
      .eq("id", data.id)
  } else {
    await supabase.from("ApiCalls").insert({
      apiName,
      queryType,
      timestamp: bucketStartTime.toISOString(),
      count: 1
    })
  }
}
