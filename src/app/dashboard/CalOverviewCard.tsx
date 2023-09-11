import { useQuery } from "@tanstack/react-query"
import {
  Card,
  Metric,
  ProgressBar,
  Tab,
  TabGroup,
  TabList,
  Text
} from "@tremor/react"
import axios from "axios"

import { useState } from "react"

export default function CalOverviewCard() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedDay = selectedIndex === 0 ? "Today" : "Yesterday"

  const { isLoading, error, data } = useQuery({
    queryKey: ["foodLogOverView"],
    queryFn: () =>
      axios.get("/api/user/get-food-chart-data").then((res) => res.data)
  })

  if (isLoading || !data) {
    return <></>
  }

  const calorieGoal = data.userGoals.calories || 2200
  const carbGoal = data.userGoals.carbs || 200
  const fatGoal = data.userGoals.fats || 200
  const proteinGoal = data.userGoals.protein || 200

  const metrics: { [key: string]: any } = [
    {
      title: "Carbs",
      remaining:
        data.metricsToday.carbs >= carbGoal
          ? `${data.metricsToday.carbs - carbGoal}g over`
          : `${carbGoal - data.metricsToday.carbs}g remaining`,
      value: (data.metricsToday.carbs / carbGoal) * 100,
      metric: `${data.metricsToday.carbs}g / ${carbGoal}g`,
      day: "Today"
    },
    {
      title: "Fats",
      remaining:
        data.metricsToday.fats >= fatGoal
          ? `${data.metricsToday.fats - fatGoal}g over`
          : `${fatGoal - data.metricsToday.fats}g remaining`,
      value: (data.metricsToday.fats / fatGoal) * 100,
      metric: `${data.metricsToday.fats}g / ${fatGoal}g`,
      day: "Today"
    },
    {
      title: "Protein",
      remaining:
        data.metricsToday.protein >= proteinGoal
          ? `${data.metricsToday.protein - proteinGoal}g over`
          : `${proteinGoal - data.metricsToday.protein}g remaining`,
      value: (data.metricsToday.protein / proteinGoal) * 100,
      metric: `${data.metricsToday.protein}g / ${proteinGoal}g`,
      day: "Today"
    },
    {
      title: "Carbs",
      remaining:
        data.metricsYesterday.carbs >= carbGoal
          ? `${data.metricsYesterday.carbs - carbGoal}g over`
          : `${carbGoal - data.metricsYesterday.carbs}g remaining`,
      value: (data.metricsYesterday.carbs / carbGoal) * 100,
      metric: `${data.metricsYesterday.carbs}g / ${carbGoal}g`,
      day: "Yesterday"
    },
    {
      title: "Fats",
      remaining:
        data.metricsYesterday.fats >= fatGoal
          ? `${data.metricsYesterday.fats - fatGoal}g over`
          : `${fatGoal - data.metricsYesterday.fats}g remaining`,
      value: (data.metricsYesterday.fats / fatGoal) * 100,
      metric: `${data.metricsYesterday.fats}g / ${fatGoal}g`,
      day: "Yesterday"
    },
    {
      title: "Protein",
      remaining:
        data.metricsYesterday.protein >= proteinGoal
          ? `${data.metricsYesterday.protein - proteinGoal}g over`
          : `${proteinGoal - data.metricsYesterday.protein}g remaining`,
      value: (data.metricsYesterday.protein / proteinGoal) * 100,
      metric: `${data.metricsYesterday.protein}g / ${proteinGoal}g`,
      day: "Yesterday"
    }
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-7 gap-4">
      <div className="col-span-2 sm:col-span-3 row-span-3 bg-amino-500 rounded-xl p-6 outline outline-2 outline-offset-2 outline-amino-600">
        <div>
          <div>Total Calories</div>
          {/* <BadgeDelta deltaType="moderateIncrease">18%</BadgeDelta> */}
        </div>
        <div className="space-x-3 truncate">
          <span>
            {selectedIndex === 0
              ? data.metricsToday.calories.toLocaleString()
              : data.metricsYesterday.calories.toLocaleString()}
          </span>
          <span>of {calorieGoal.toLocaleString()}</span>
        </div>
        <TabGroup
          index={selectedIndex}
          onIndexChange={setSelectedIndex}
          className="mt-6"
        >
          <TabList>
            <Tab className={(selectedIndex === 0 && "font-bold") || ""}>
              Today
            </Tab>
            <Tab className={(selectedIndex === 1 && "font-bold") || ""}>
              Yesterday
            </Tab>
          </TabList>
        </TabGroup>
        {metrics
          .filter((item: any) => item.day === selectedDay)
          .map((item: any) => (
            <div key={item.title} className="space-y-2 mt-4">
              <div>{item.title}</div>
              <div className="flex justify-between">
                <div className="text-zinc-600 text-sm">{item.remaining}</div>
                <div className="text-zinc-600 text-sm">{`(${item.metric})`}</div>
              </div>
              <ProgressBar value={item.value} />
            </div>
          ))}
      </div>
      <StreakCard />
      <Card className="col-span-1 sm:col-span-2">
        <Text>Foods Logged</Text>
        <Metric>42</Metric>
      </Card>
      <Card className="col-span-1 sm:col-span-2">
        <Text>Calories Consumed</Text>
        <Metric>425,843</Metric>
      </Card>
    </div>
  )
}

function StreakCard() {
  const { isLoading, error, data } = useQuery({
    queryKey: ["dayStreak"],
    queryFn: () => axios.get("/api/user/get-streak").then((res) => res.data)
  })

  if (isLoading || !data) {
    return <></>
  }
  return (
    <div className="col-span-1 sm:col-span-2 bg-amino-500 rounded-xl p-6 outline outline-2 outline-offset-2 outline-amino-600">
      <div className="text-sm">Day Streak</div>
      <div className="text-2xl font-bold">{data.streak}</div>
    </div>
  )
}
