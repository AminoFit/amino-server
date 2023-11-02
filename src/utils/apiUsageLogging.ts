import { createAdminSupabase } from "./supabase/serverAdmin"

export async function checkRateLimit(apiName: string, maxCount: number, timeFrame: number): Promise<boolean> {
  // Chris TODO

  // let currentTime = new Date()
  // let pastTime = new Date(currentTime.getTime() - timeFrame)

  // const supabase = createAdminSupabase()

  // const groupedRecords = await prism.apiCalls.groupBy({
  //   by: ["apiName"],
  //   where: {
  //     apiName: apiName,
  //     timestamp: {
  //       gte: pastTime,
  //       lt: currentTime
  //     }
  //   },
  //   _sum: {
  //     count: true
  //   }
  // })

  // let total = groupedRecords[0]?._sum?.count || 0

  // return total < maxCount
  return true
}

export async function recordQuery(apiName: string, queryType: string) {
  let bucketStartTime = new Date()
  bucketStartTime.setMinutes(0, 0, 0) // Bucketing by the hour

  const supabase = createAdminSupabase()

  const { data, error } = await supabase
    .from("api_calls")
    .select("*")
    .eq("apiName", apiName)
    .eq("queryType", queryType)
    .eq("timestamp", bucketStartTime)
    .single()

  if (data) {
    await supabase
      .from("api_calls")
      .update({
        count: data.count + 1
      })
      .eq("id", data.id)
  } else {
    await supabase.from("api_calls").insert({
      apiName,
      queryType,
      timestamp: bucketStartTime,
      count: 1
    })
  }
}
