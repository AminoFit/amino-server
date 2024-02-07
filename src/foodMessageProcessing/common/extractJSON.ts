export function extractAndParseLastJSON(inputString: string) {
  // Regular expression to find content between triple backticks
  const jsonRegex = /```json\n([\s\S]*?)\n```/g;
  // Regex to find the last JSON object
  const fallbackJsonRegex = /{[\s\S]*?}$/;

  let lastMatch;
  let match;
  // Use a loop to find the last match with the first pattern
  while ((match = jsonRegex.exec(inputString)) !== null) {
    lastMatch = match;
  }

  // If a match is found with the first pattern, try parsing it
  if (lastMatch) {
    try {
      return JSON.parse(lastMatch[1]);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      // If parsing fails, do not return immediately; try the fallback pattern
    }
  }

  // Fallback: try to find and parse the last JSON object if the first pattern didn't match or failed to parse
  const fallbackMatch = inputString.match(fallbackJsonRegex);
  if (fallbackMatch) {
    try {
      return JSON.parse(fallbackMatch[0]);
    } catch (e) {
      console.error("Error parsing fallback JSON:", e);
      return null;
    }
  }

  // If no JSON found or all parsing attempts failed
  console.warn("No JSON found in the input string");
  return null;
}
