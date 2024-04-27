export function extractAndParseLastJSON(inputString: string) {
  // if first character is not a curly brace, add one
  if (inputString.charAt(0) !== '{') {
    inputString = '{' + inputString;
  }
  // Regular expression to find content between triple backticks
  const jsonRegex = /```json\n([\s\S]*?)\n```/g;
  // Regex to find the last JSON object
  const fallbackJsonRegex = /\{[\s\S]*?\}$/;
  // Regex to find math expressions
  const mathExpressionRegex = /(\d+(?:\.\d+)?\s*[*/]\s*\d+(?:\.\d+)?)/g;

  let lastMatch;
  let match;

  // Use a loop to find the last match with the first pattern
  while ((match = jsonRegex.exec(inputString)) !== null) {
    lastMatch = match;
  }

  // If a match is found with the first pattern, try parsing it
  if (lastMatch) {
    try {
      // Replace math expressions with their evaluated values
      const jsonString = lastMatch[1].replace(mathExpressionRegex, (match) => {
        try {
          return eval(match);
        } catch (e) {
          console.error("Error evaluating math expression:", e);
          return match;
        }
      });
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      // If parsing fails, do not return immediately; try the fallback pattern
    }
  }

  // Fallback: try to find and parse the last JSON object if the first pattern didn't match or failed to parse
  const fallbackMatch = inputString.match(fallbackJsonRegex);
  if (fallbackMatch) {
    try {
      // Replace math expressions with their evaluated values
      const jsonString = fallbackMatch[0].replace(mathExpressionRegex, (match) => {
        try {
          return eval(match);
        } catch (e) {
          console.error("Error evaluating math expression:", e);
          return match;
        }
      });
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("Error parsing fallback JSON:", e);
      return null;
    }
  }

  // If no JSON found or all parsing attempts failed
  console.warn("No JSON found in the input string");
  return null;
}