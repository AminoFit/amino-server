import { get_encoding } from "tiktoken"


// Function to trim text to fit within a token limit
export function trimToToken(text: string, tokenLimit: number) {
    const encoder = get_encoding("o200k_base")
    let start = 0
    let end = text.length
    let lastValidIndex = 0
  
    while (start <= end) {
      const mid = Math.floor((start + end) / 2)
      const midText = text.slice(0, mid)
      const tokenCount = encoder.encode(midText).length
  
      if (tokenCount <= tokenLimit) {
        lastValidIndex = mid
        start = mid + 1
      } else {
        end = mid - 1
      }
    }
  
    return text.slice(0, lastValidIndex)
  }