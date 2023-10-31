import { createAdminSupabase } from "./supabase/serverAdmin"

export async function checkRateLimit(apiName: string, maxCount: number, timeFrame: number): Promise<boolean> {
  // Chris TODO

  // let currentTime = new Date()
  // let pastTime = new Date(currentTime.getTime() - timeFrame)

  // const supabase = createAdminSupabase()

  // const groupedRecords = await prisma.apiCalls.groupBy({
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
  return false
}

export async function recordQuery(apiName: string, queryType: string) {
  // Chris TODO
  
  // let bucketStartTime = new Date()
  // bucketStartTime.setMinutes(0, 0, 0) // Bucketing by the hour

  // const supabase = createAdminSupabase()

  // const existingRecord = await prisma.apiCalls.findFirst({
  //   where: {
  //     apiName: apiName,
  //     queryType: queryType,
  //     timestamp: bucketStartTime
  //   }
  // })

  // if (existingRecord) {
  //   await prisma.apiCalls.update({
  //     where: { id: existingRecord.id },
  //     data: { count: { increment: 1 } }
  //   })
  // } else {
  //   await prisma.apiCalls.create({
  //     data: {
  //       apiName: apiName,
  //       queryType: queryType,
  //       timestamp: bucketStartTime,
  //       count: 1
  //     }
  //   })
  // }
}
