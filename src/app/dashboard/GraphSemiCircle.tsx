"use client";

import { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";

export function GraphSemiCircle({
  percentage,
  color,
  label,
}: {
  percentage: number;
  color: string;
  label: string;
}) {
  const options: ApexOptions = {
    plotOptions: {
      radialBar: {
        hollow: {
          size: "60%",
        },
        startAngle: -90,
        endAngle: 90,
        track: {
          strokeWidth: "40%",
        },
        dataLabels: {
          name: {
            offsetY: -12,
          },
          value: {
            offsetY: -10,
          },
        },
      },
    },
    stroke: {
      lineCap: "round",
    },
    labels: [label],
    legend: {
      show: false,
    },
    colors: [color],
  };

  return (
    <div className="flex justify-center -mb-6">
      <Chart
        options={options}
        series={[Math.round(percentage)]}
        type="radialBar"
        width="200"
        height="200"
      />
    </div>
  );
}
