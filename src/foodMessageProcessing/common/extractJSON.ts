export function extractAndParseLastJSON(inputString: string) {
    // Regular expression to find content between triple backticks
    const jsonRegex = /```json\n([\s\S]*?)\n```/g
  
    let lastMatch
    let match
    // Use a loop to find the last match
    while ((match = jsonRegex.exec(inputString)) !== null) {
      lastMatch = match
    }
  
    // If a match is found, try parsing it
    if (lastMatch) {
      try {
        return JSON.parse(lastMatch[1])
      } catch (e) {
        // console.error("Error parsing JSON:", e)
        return null
      }
    } else {
      // console.warn("No JSON found in the input string")
      return null
    }
  }