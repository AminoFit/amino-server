import { i } from "mathjs"

export function extractAndParseLastJSON(inputString: string, evalMath: boolean = true) {
  // Strip non-JSON text and balance brackets before processing
  inputString = stripAndBalanceBrackets(inputString)
  // Regular expression to find content between triple backticks labeled as JSON
  const jsonRegex = /```json\n([\s\S]*?)\n```/g
  // Fallback regex to capture the last well-formed JSON object
  const fallbackJsonRegex = /{(?:[^{}]*|{(?:[^{}]*|{(?:[^{}]*|{(?:[^{}]*|{[^{}]*})*})*})*})*}/

  // Regex to find and evaluate math expressions within the JSON string
  const mathExpressionRegex = /\d+(\.\d+)?(?:\s*[*/+-]\s*\d+(\.\d+)?)+/g

  let lastMatch, match

  // Iterate to find the last match with the JSON-specific pattern
  while ((match = jsonRegex.exec(inputString)) !== null) {
    lastMatch = match
  }

  // Utility function to evaluate math expressions if evalMath is true
  const replaceMathExpressions = (str: string) => {
    return evalMath ? str.replace(mathExpressionRegex, (expr) => {
      try {
        return eval(expr)
      } catch (e) {
        console.error("Error evaluating math expression:", e)
        return expr // Return the original expression if evaluation fails
      }
    }) : str
  }

  // If a match is found, attempt to parse it
  if (lastMatch) {
    try {
      // Replace math expressions within the JSON string and evaluate them
      const jsonString = replaceMathExpressions(lastMatch[1])
      return JSON.parse(jsonString) // Parse the modified JSON string
    } catch (e) {
      console.error("Error parsing JSON:", e)
      // If parsing fails, try the fallback regex
    }
  }

  // Fallback: attempt to find and parse the last JSON object
  const fallbackMatch = inputString.match(fallbackJsonRegex)
  if (fallbackMatch) {
    try {
      // Replace math expressions with their evaluated values
      const jsonString = replaceMathExpressions(fallbackMatch[0])
      return JSON.parse(jsonString) // Parse the modified JSON string
    } catch (e) {
      console.error("Error parsing fallback JSON:", e)
      return null
    }
  }

  // Log a warning if no JSON is found and return null
  console.warn("No JSON found in the input string for the user message:", inputString)
  return null
}

function stripAndBalanceBrackets(inputString: string) {
  let depth = 0
  let filteredString = ""

  for (let i = 0; i < inputString.length; i++) {
    const char = inputString[i]

    if (char === "{") {
      if (depth === 0 && filteredString && !filteredString.endsWith("\n")) {
        filteredString += "\n" // Ensure proper newline separation for JSON blocks
      }
      depth++
    }

    if (depth > 0) {
      filteredString += char
    }

    if (char === "}") {
      depth--
      if (depth === 0 && i !== inputString.length - 1) {
        filteredString += "\n" // Append newline after closing a JSON block
      }
    }
  }

  return filteredString
}

function testExtractJSON() {
  const inputString = ` {
  "equation_grams": "20 * 2.03",
  "serving_name": "half",
  "amount": 20,
  "matching_serving_id": 1
}
`
  console.log(inputString.toString())
  const result = extractAndParseLastJSON(inputString)
  console.log(result)
}

// testExtractJSON()
