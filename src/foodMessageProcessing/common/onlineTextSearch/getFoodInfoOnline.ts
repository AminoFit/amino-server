import axios from "axios"
import { htmlToText } from "html-to-text"
import { isWithinTokenLimit } from "gpt-tokenizer";

const apiKey = process.env.SERPER_API_KEY || ""

if (!apiKey) {
  throw new Error("SERPER_API_KEY environment variable is not set.")
}

// Function to perform a Google search using the SERPER API
async function searchGoogle(query: string) {
  const url = "https://google.serper.dev/search"
  const headers = {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json"
  }
  const body = JSON.stringify({ q: query })

  try {
    const response = await fetch(url, { method: "POST", headers: headers, body: body })
    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error fetching search results:", error)
    return null
  }
}

// Function to extract the second-level domain from a hostname (even if it includes subdomains)
function getBaseDomain(hostname: string): string {
  const parts = hostname.split(".").reverse() // Reverse domain parts
  if (parts.length >= 3) {
    // Check for country code TLDs (e.g., `co.uk`)
    if (parts[1].length === 2 && parts[0].length === 2) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`
    }
  }
  return parts.length >= 2 ? `${parts[1]}.${parts[0]}` : hostname
}

// Function to ensure getting distinct URLs from search results
async function getSearchResults(foodName: string, numResults = 3) {
  const ignoreDomains = [
    "amazon.com",
    "walmart.com",
    "kingkullen.com",
    "costco.com",
    "foodlion.com",
    "vitaminshoppe.com",
    "martinsfoods.com",
    "carbmanager.com",
    "www.myfitnesspal.com"
  ]; // Specify domains to ignore

  const query = `${foodName} nutrition weight calories protein fat carbs`;
  const data = await searchGoogle(query);
  if (!data || !data.organic.length) {
    console.log("No organic results found.");
    return [];
  }

  let results = [];
  const firstOrganicUrl = new URL(data.organic[0].link);

  // Check if the domain is not in the ignoreDomains list
  if (
    !ignoreDomains.includes(getBaseDomain(firstOrganicUrl.hostname)) &&
    !firstOrganicUrl.href.endsWith(".pdf")
  ) {
    results.push(firstOrganicUrl.href); // Add the first URL
  }

  for (let i = 1; i < data.organic.length; i++) {
    let url = new URL(data.organic[i].link);
    // Check if the domain is different from the first URL's domain, not in the ignoreDomains list, and not a PDF
    if (
      url.hostname !== firstOrganicUrl.hostname &&
      !ignoreDomains.includes(getBaseDomain(url.hostname)) &&
      !url.href.endsWith(".pdf")
    ) {
      results.push(url.href);
      if (results.length === numResults) break; // Stop when we reach the required number of results
    }
  }

  // If we don't find enough different domain URLs in organic results and we can use the Knowledge Graph
  if (results.length < numResults && data.knowledgeGraph && data.knowledgeGraph.website) {
    let kgUrl = new URL(data.knowledgeGraph.website);
    // Ensure it's different from the first URL, not in the ignoreDomains list, and not a PDF
    if (
      kgUrl.hostname !== firstOrganicUrl.hostname &&
      !ignoreDomains.includes(getBaseDomain(kgUrl.hostname)) &&
      !kgUrl.href.endsWith(".pdf")
    ) {
      results.push(kgUrl.href);
    }
  }

  // If still less than the requested number of results, add more from organic results
  if (results.length < numResults) {
    for (let i = 1; i < data.organic.length && results.length < numResults; i++) {
      let url = new URL(data.organic[i].link);
      if (
        !results.includes(url.href) &&
        !ignoreDomains.includes(getBaseDomain(url.hostname)) &&
        !url.href.endsWith(".pdf")
      ) {
        results.push(url.href);
      }
    }
  }

  return results.slice(0, numResults); // Limit the results to the specified number
}

// Function to fetch and convert URL content to text
async function fetchAndConvertUrlToText(url: string) {
  console.log("fetching", url)
  try {
    const response = await axios.get(url, {
      timeout: 2000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.9999.999 Safari/537.36"
      }
    })

    const html = response.data
    const text = htmlToText(html, {
      baseElements: { selectors: ["main", "article", "section"] },
      selectors: [
        { selector: "a", format: "inline", options: { ignoreHref: true } },
        { selector: "img", format: "skip" }
      ]
    })
    return text
  } catch (error) {
    console.error("Error fetching or converting URL to text:", error)
    return "" // Return empty string or handle as needed for failed fetch
  }
}

// Main function to get food information
async function searchGoogleForFoodInfo(foodName: string, numResults = 2) {
  console.log("searching for", foodName);
  const urls = await getSearchResults(foodName, numResults);
  
  // Using Promise.all to fetch all URLs in parallel
  const texts = await Promise.all(urls.map(async (url) => {
    console.log("Processing URL:", url);
    return await fetchAndConvertUrlToText(url);
  }));

  // Combine texts
  let combinedText = texts.join(" ");
  
  // Check if combined text is within token limit, and clip if necessary
  const tokenLimit = 10000;
  if (!isWithinTokenLimit(combinedText, tokenLimit)) {
    // Reduce the text until it fits within the token limit
    while (!isWithinTokenLimit(combinedText, tokenLimit) && combinedText.length > 0) {
      combinedText = combinedText.slice(0, -100); // Remove last 100 characters and check again
    }
  }

  return combinedText;
}



// searchGoogleForFoodInfo('Chocolate Nutrition Shake, Chocolate by Fairlife',2)

// Example usage
// getFoodInfo('Lean Body Chocolate Protein Shake 14 fl oz', 2).then(text => console.log('Extracted Text:', text));
// fetchAndConvertUrlToText('https://www.heb.com/product-detail/core-power-elite-42g-protein-milk-shake-chocolate/2042739').then(text => console.log('Extracted Text:', text));
// fetchAndConvertUrlToText(
//   "https://www.costco.com/fairlife-nutrition-plan%2C-30g-protein-shake%2C-chocolate%2C-11.5-fl-oz%2C-18-pack.product.100727293.html"
// ).then((text) => console.log("Extracted Text:", text))
