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
