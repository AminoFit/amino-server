export const levenshteinDistance = (
  s: string,
  t: string,
  threshold: number = Infinity
) => {
  s = s.toLowerCase()
  t = t.toLowerCase()

  if (Math.abs(s.length - t.length) > threshold) {
    return threshold + 1
  }

  const arr = []
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i]
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] =
        i === 0
          ? j
          : Math.min(
              arr[i - 1][j] + 1,
              arr[i][j - 1] + 1,
              arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
            )
    }

    if (i !== 0 && Math.min(...arr[i]) > threshold) {
      return threshold + 1
    }
  }

  return arr[t.length][s.length]
}

export const jaccardSimilarity = (s: string, t: string) => {
  // Normalize and split the strings into words
  const wordsS = s.toLowerCase().split(/\s+/)
  const wordsT = t.toLowerCase().split(/\s+/)

  // Create sets from the word arrays
  const setS = new Set(wordsS)
  const setT = new Set(wordsT)

  // Calculate the intersection and union of the two sets
  const intersection = new Set([...setS].filter((word) => setT.has(word)))
  const union = new Set([...setS, ...setT])

  // Calculate and return the Jaccard similarity
  return intersection.size / union.size
}

export function wordLevenshtein(s1: string, s2: string, threshold?: number): number {
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const len1 = words1.length;
  const len2 = words2.length;
  const dp: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  let minDistance = Infinity; // Keep track of the minimum distance encountered

  for (let i = 0; i <= len1; i++) {
    for (let j = 0; j <= len2; j++) {
      if (i === 0) {
        dp[i][j] = j;
      } else if (j === 0) {
        dp[i][j] = i;
      } else if (words1[i - 1] === words2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }

      // Update minimum distance if needed
      minDistance = Math.min(minDistance, dp[i][j]);
    }

    // Early stopping based on threshold
    if (threshold !== undefined && minDistance > threshold) {
      return minDistance;
    }
  }

  return dp[len1][len2];
}

function runTest() {
  console.log(levenshteinDistance("Catalina", "Catalina Crunch"))
  console.log(jaccardSimilarity("Catalina Cereal", "Catalina Crunch"))
  console.log(wordLevenshtein("Catalina Cereal", "Catalina Crunch", 1)) // Output should be true
  console.log(wordLevenshtein("Catalina Cereal Protein", "Catalina Crunch", 6)) // Output should be false
  console.log(wordLevenshtein("Catalina Cereal Protein", "Catalina Crunch", 2)) // Output should be true
}

//runTest()
