"use client"

import { ApexOptions } from "apexcharts"
import Chart from "react-apexcharts"

const greyBar = [
  {
    offset: 0,
    color: "#333333",
    opacity: 1
  },
  {
    offset: 100,
    color: "#181818",
    opacity: 1
  }
]

const greenBar = [
  {
    offset: 0,
    color: "#B0EB5F",
    opacity: 1
  },
  {
    offset: 100,
    color: "#72973F",
    opacity: 1
  }
]

export function GraphCalorieChart({
  calories,
  label
}: {
  calories: number[]
  label: string
}) {
  const options: ApexOptions = {
    chart: {
      // height: 250,
      // width: "100%",
      type: "bar",
      toolbar: {
        show: false
      },
      sparkline: {
        enabled: true
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        dataLabels: {
          position: "top" // top, center, bottom
        },
        columnWidth: "55%",
        distributed: true,
      }
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "vertical",
        shadeIntensity: 0.5,
        gradientToColors: undefined, // optional, if not defined - uses the shades of same color in series
        // inverseColors: true,
        opacityFrom: 1,
        opacityTo: 1,
        colorStops: [
          greyBar,
          greyBar,
          greyBar,
          greenBar,
          greyBar,
          greyBar,
          greyBar
        ]
      }
    },
    dataLabels: {
      enabled: true,
      // formatter: function (val) {
      //   return val + "%"
      // },
      // offsetY: -20,
      style: {
        fontSize: "10px",
        colors: ["#2F2F2F"]
      },
      
    },
    grid: {
      show: false // you can either change hear to disable all grids
      // xaxis: {
      //   lines: {
      //     show: true  //or just here to disable only x axis grids
      //    }
      //  },
      // yaxis: {
      //   lines: {
      //     show: true  //or just here to disable only y axis
      //    }
      //  },
      // padding: {
      //   left: -20,
      // }
    },

    xaxis: {
      categories: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      position: "top",
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      }
      ,
      labels: {
        show: true,
      }
      // crosshairs: {
      //   fill: {
      //     type: "gradient",
      //     gradient: {
      //       colorFrom: "#D8E3F0",
      //       colorTo: "#BED1E6",
      //       stops: [0, 100],
      //       opacityFrom: 0.4,
      //       opacityTo: 0.5
      //     }
      //   }
      // },
      // tooltip: {
      //   enabled: true
      // }
    },
    yaxis: {
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      labels: {
        show: false,
        // formatter: function (val) {
        //   return val + "%"
        // }
      }
    }
    // title: {
    //   text: "Monthly Inflation in Argentina, 2002",
    //   floating: true,
    //   // offsetY: 330,
    //   align: "center",
    //   style: {
    //     color: "#444"
    //   }
    // }
  }

  return (
    <div className="">
      <Chart
        options={options}
        series={[
          {
            name: "Calories",
            data: [2458, 2588, 3128, 2212, 1908, 4100, 2874]
          }
        ]}
        width="100%"
        height="100px"
        type="bar"
      />
    </div>
  )
}
