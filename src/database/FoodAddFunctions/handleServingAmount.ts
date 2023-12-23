import { Tables } from "types/supabase"

export function assignDefaultServingAmount(servings: Tables<"Serving">[]): Tables<"Serving">[] {
  return servings.map((serving) => {
    // Match only numbers (including decimals) followed by a space
    const match = serving.servingName.match(/^(\d+(\.\d+)?)\s/);

    let defaultServingAmount = serving.defaultServingAmount || 1;
    let servingName = serving.servingName;

    if (match && (defaultServingAmount === 1 || defaultServingAmount === null)) {
      defaultServingAmount = parseFloat(match[1]); // match the numeric part
      servingName = serving.servingName.substring(match[0].length).trim();
    }

    return {
      ...serving,
      defaultServingAmount,
      servingName
    };
  });
}


function testServingAmount() {
  let servings: Tables<"Serving">[] = [
    {
      id: 999,
      servingWeightGram: 14,
      servingName: "0.12999999523162842 bar",
      foodItemId: 249,
      servingAlternateAmount: 0.129999995231628,
      servingAlternateUnit: "bar",
      defaultServingAmount: 1.0
    },
    {
      id: 1073,
      servingWeightGram: 5,
      servingName: "0.5 package",
      foodItemId: 273,
      servingAlternateAmount: 0.5,
      servingAlternateUnit: "package",
      defaultServingAmount: 1.0
    },
    {
      id: 917,
      servingWeightGram: 95,
      servingName: "1 bagel",
      foodItemId: 229,
      servingAlternateAmount: 1,
      servingAlternateUnit: "bagel",
      defaultServingAmount: 1.0
    },
    {
      id: 1182,
      servingWeightGram: 40,
      servingName: "1 bar(40g)",
      foodItemId: 311,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 706,
      servingWeightGram: 80,
      servingName: "1 oz,dry,yields",
      foodItemId: 159,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 413,
      servingWeightGram: 128,
      servingName: "1 package(4.5oz)",
      foodItemId: 85,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 453,
      servingWeightGram: 130,
      servingName: "1 serving(130g)",
      foodItemId: 99,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 896,
      servingWeightGram: 34,
      servingName: "1 serving(34g)",
      foodItemId: 220,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 90,
      servingWeightGram: 10,
      servingName: "10 pieces",
      foodItemId: 18,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 1056,
      servingWeightGram: null,
      servingName: "17 floz",
      foodItemId: 268,
      servingAlternateAmount: 502.7495,
      servingAlternateUnit: "ml",
      defaultServingAmount: 1.0
    },
    {
      id: 655,
      servingWeightGram: 29,
      servingName: "2 cookies",
      foodItemId: 144,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 888,
      servingWeightGram: 67,
      servingName: "2/3 cup",
      foodItemId: 216,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 450,
      servingWeightGram: 85,
      servingName: "2/3 cup",
      foodItemId: 97,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 1107,
      servingWeightGram: 113,
      servingName: "4 ONZ",
      foodItemId: 285,
      servingAlternateAmount: null,
      servingAlternateUnit: null,
      defaultServingAmount: 1.0
    },
    {
      id: 1211,
      servingWeightGram: null,
      servingName: "8 floz",
      foodItemId: 316,
      servingAlternateAmount: 1,
      servingAlternateUnit: "serving",
      defaultServingAmount: 1.0
    },
    {
      id: 691,
      servingWeightGram: 417,
      servingName: '8" pie',
      foodItemId: 156,
      servingAlternateAmount: 1,
      servingAlternateUnit: '8" pie',
      defaultServingAmount: 1.0
    },
    {
      id: 656,
      servingWeightGram: 132,
      servingName: "cup",
      foodItemId: 145,
      servingAlternateAmount: 1,
      servingAlternateUnit: "cup",
      defaultServingAmount: 1.0
    }
  ]

  servings = assignDefaultServingAmount(servings)
  servings = assignDefaultServingAmount(servings)
  servings = assignDefaultServingAmount(servings)

  console.log(servings)
}

// testServingAmount()
