import { ArrowDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  TabList,
  Tab,
  ProgressBar,
  Text,
  Flex,
  Button,
  Metric,
  BadgeDelta,
  TabGroup,
  Grid
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

  const metrics: { [key: string]: any } = [
    {
      title: "Carbs",
      remaining:
        data.metricsToday.carbs >= data.userGoals.carbs
          ? `(${data.metricsToday.carbs - data.userGoals.carbs}g over)`
          : `(${data.userGoals.carbs - data.metricsToday.carbs}g remaining)`,
      value: (data.metricsToday.carbs / data.userGoals.carbs) * 100,
      metric: `${data.metricsToday.carbs}g / ${data.userGoals.carbs}g`,
      day: "Today"
    },
    {
      title: "Fats",
      remaining:
        data.metricsToday.fats >= data.userGoals.fats
          ? `(${data.metricsToday.fats - data.userGoals.fats}g over)`
          : `(${data.userGoals.fats - data.metricsToday.fats}g remaining)`,
      value: (data.metricsToday.fats / data.userGoals.fats) * 100,
      metric: `${data.metricsToday.fats}g / ${data.userGoals.fats}g`,
      day: "Today"
    },
    {
      title: "Protein",
      remaining:
        data.metricsToday.protein >= data.userGoals.protein
          ? `(${data.metricsToday.protein - data.userGoals.protein}g over)`
          : `(${
              data.userGoals.protein - data.metricsToday.protein
            }g remaining)`,
      value: (data.metricsToday.protein / data.userGoals.protein) * 100,
      metric: `${data.metricsToday.protein}g / ${data.userGoals.protein}g`,
      day: "Today"
    },
    {
      title: "Carbs",
      remaining:
        data.metricsYesterday.carbs >= data.userGoals.carbs
          ? `(${data.metricsYesterday.carbs - data.userGoals.carbs}g over)`
          : `(${
              data.userGoals.carbs - data.metricsYesterday.carbs
            }g remaining)`,
      value: (data.metricsYesterday.carbs / data.userGoals.carbs) * 100,
      metric: `${data.metricsYesterday.carbs}g / ${data.userGoals.carbs}g`,
      day: "Yesterday"
    },
    {
      title: "Fats",
      remaining:
        data.metricsYesterday.fats >= data.userGoals.fats
          ? `(${data.metricsYesterday.fats - data.userGoals.fats}g over)`
          : `(${data.userGoals.fats - data.metricsYesterday.fats}g remaining)`,
      value: (data.metricsYesterday.fats / data.userGoals.fats) * 100,
      metric: `${data.metricsYesterday.fats}g / ${data.userGoals.fats}g`,
      day: "Yesterday"
    },
    {
      title: "Protein",
      remaining:
        data.metricsYesterday.protein >= data.userGoals.protein
          ? `(${data.metricsYesterday.protein - data.userGoals.protein}g over)`
          : `(${
              data.userGoals.protein - data.metricsYesterday.protein
            }g remaining)`,
      value: (data.metricsYesterday.protein / data.userGoals.protein) * 100,
      metric: `${data.metricsYesterday.protein}g / ${data.userGoals.protein}g`,
      day: "Yesterday"
    }
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-7 gap-4">
      <Card className="col-span-2 sm:col-span-3 row-span-3">
        <Flex alignItems="start">
          <Text>Total Calories</Text>
          {/* <BadgeDelta deltaType="moderateIncrease">18%</BadgeDelta> */}
        </Flex>
        <Flex
          justifyContent="start"
          alignItems="baseline"
          className="space-x-3 truncate"
        >
          <Metric>
            {selectedIndex === 0
              ? data.metricsToday.calories.toLocaleString()
              : data.metricsYesterday.calories.toLocaleString()}
          </Metric>
          <Text>of {data.userGoals.calories.toLocaleString()}</Text>
        </Flex>
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
              <Flex>
                <Text>
                  {item.title}{" "}
                  <span className="text-gray-400">{item.remaining}</span>
                </Text>
                <Text>
                  {`${item.value.toFixed(0)}% `}{" "}
                  <span className="text-gray-400">{`(${item.metric})`}</span>
                </Text>
              </Flex>
              <ProgressBar value={item.value} />
            </div>
          ))}
      </Card>
      <Card className="col-span-1 sm:col-span-2">
        <Text>Day streak</Text>
        <Metric>4</Metric>
      </Card>
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
