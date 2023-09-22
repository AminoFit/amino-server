export const runtime = "edge"

import { NextResponse } from "next/server"

export async function GET() {
  const jobID = (Math.random() * 10000).toFixed(0)
  console.log("Starting job", jobID)

  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Running", jobID)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log("Finished job", jobID)

  return NextResponse.json(
    { now: Date.now() },
    {
      status: 200
    }
  )
}
