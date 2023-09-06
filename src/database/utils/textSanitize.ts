export function sanitizeServingName(name: string) {
  // Regular expressions to match numeric and word-based quantities
  const numericPattern = /^[-]?\d+(\.\d+)?\s*/
  const wordQuantities = ["quarter", "half", "third", "fourth"] // Expand this as needed

  // Remove numeric quantities
  name = name.replace(numericPattern, "").trim()

  // Remove word-based quantities
  for (const word of wordQuantities) {
    name = name.replace(new RegExp("^" + word + "\\s*", "i"), "").trim()
  }

  return name
}
