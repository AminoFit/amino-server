"use client"

import { Card, Title, BarChart, Subtitle } from "@tremor/react"

const chartdata = [
  {
    name: "Sun",
    Calories: 2488
  },
  {
    name: "Mon",
    Calories: 2488
  },
  {
    name: "Tue",
    Calories: 2488
  },
  {
    name: "Wed",
    Calories: 2488
  },
  {
    name: "Thur",
    Calories: 2488
  },
  {
    name: "Fri",
    Calories: 2488
  },
  {
    name: "Sat",
    Calories: 2488
  }
]

const dataFormatter = (number: number) => {
  return "$ " + Intl.NumberFormat("us").format(number).toString()
}

export const CalorieChart = () => (
  <BarChart
    className="mt-6 h-20"
    data={chartdata}
    index="name"
    categories={["Calories"]}
    colors={["lime"]}
    valueFormatter={dataFormatter}
    yAxisWidth={48}
    showXAxis={true}
    showYAxis={false}
    showLegend={false}
    showGridLines={false}
  />
)
