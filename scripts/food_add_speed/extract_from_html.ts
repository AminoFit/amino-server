import fetch from "node-fetch";
import { htmlToText } from "html-to-text";
import OpenAI from "openai";
import { FireworksChatCompletion } from "@/languageModelProviders/fireworks/chatCompletionFireworks";
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper";
import { std, mean, quantileSeq } from 'mathjs';
import { extractAndParseLastJSON } from "@/foodMessageProcessing/common/extractJSON";

const apiKey = process.env.SERPER_API_KEY || ""

if (!apiKey) {
    throw new Error("SERPER_API_KEY environment variable is not set.");
}


async function searchGoogle(query: string) {
    const url = "https://google.serper.dev/search";
    const headers = {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
    };
    const body = JSON.stringify({ q: query });

    try {
        const response = await fetch(url, { method: "POST", headers: headers, body: body });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching search results:", error);
        return null;
    }
}

async function getFirstOrganicResult(query: string) {
    const data = await searchGoogle(query);
    if (!data || !data.organic.length) {
        console.log("No organic results found.");
        return { firstOrganicUrl: null, fallbackUrl: null, snippets: "" };
    }

    const snippets = data.organic.slice(0, 10).map((result: any) => result.snippet).join(" ");
    const firstOrganicUrl = data.organic[0].link;
    let fallbackUrl = data.knowledgeGraph?.website;
    fallbackUrl = (fallbackUrl && fallbackUrl !== firstOrganicUrl) ? fallbackUrl : (data.organic.length > 1 ? data.organic[1].link : null);

    return { firstOrganicUrl, fallbackUrl, snippets };
}

async function fetchAndConvertUrlToText(url: string) {
    try {
        const response = await fetch(url);
        let html = await response.text();
        let mainText = htmlToText(html, {
            wordwrap: null,
            baseElements: { selectors: ["main", "article", "section"], orderBy: "occurrence" }
        });
        return mainText;
    } catch (error) {
        console.error("Error fetching or converting URL to text:", error);
        return "";
    }
}

async function extractInfoAsJSON(text: string, foodName: string) {
    const user = await getUserByEmail("seb.grubb@gmail.com");
    const model = "accounts/fireworks/models/llama-v3-70b-instruct";
    const temperature = 0;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a helpful assistant that only replies in valid JSON. The JSON is fully valid and contains no comments."
        },
        {
            role: "user",
            content: `<instructions>
extract the nutritional information (serving weight g/ml plus all calories, fat, etc. info) from the following search_text for `+ foodName+` in this JSON format: 
Set text_contains_all_nutrition to false if we don't have enough information to infer weight in grams or ml, calories, fat, protein and carbs.
{
    "text_contains_all_nutrition": false
}

Since metric values are required you may express them as an equation. E.g. if you know an item is 3 oz you can output
serving_default_size_g: "3*28.3495" (3 oz in grams)
</instructions>

<json_output_template>
{
"name": "string",
"brand": "string",
"serving_default_size_g": "number | string",
"is_liquid": "bool",
"serving_default_size_ml": "number | string | null",
"kcalPerServing": "number",
"totalFatPerServing": "number",
"satFatPerServing": "number | null",
"transFatPerServing": "number | null",
"carbPerServing": "number",
"sugarPerServing": "number | null",
"addedSugarPerServing": "number | null",
"proteinPerServing": "number",
"UPC": "number | null",
"fiberPerServing": "number | null",
"Serving": [
    {
    "serving_size_g": "number",
    "serving_name": "string",
    "servingAlternateAmount": "number | null",
    "servingAlternateUnit": "string | null"
    }
]
"text_contains_all_nutrition": "boolean",
}
</json_output_template>
<search_text>
` + text + "</search_text>"
        }
    ];

    try {
        const response = await FireworksChatCompletion(user!, { model, messages, temperature });
        console.log("Complete food info using Llama:", response);
        return response;
    } catch (error) {
        console.error(`Complete food info using Llama failed: ${error}`);
    }
}

async function getFoodInfoJSON(foodName: string) {
    const query = foodName + " nutrition";
    const { firstOrganicUrl, fallbackUrl, snippets } = await getFirstOrganicResult(query);

    let urlsToTry = [firstOrganicUrl, fallbackUrl].filter(Boolean); 
    console.log("URLs to try:", urlsToTry);


    for (let url of urlsToTry) {
        const appendedText = await fetchAndConvertUrlToText(url) + " " + snippets;
        console.log("Appended text:", appendedText);
        if (appendedText) {
            const extractionResult = extractAndParseLastJSON((await extractInfoAsJSON(appendedText, foodName))!,);
            if (extractionResult && extractionResult.text_contains_nutrition !== false) {
                return extractionResult;
            }
        }
    }

    console.log("No valid nutrition information found from the URLs checked.");
    return null;
}

// Example usage
// getFoodInfoJSON("core power elite strawberry").then(info => console.log("Extracted Info JSON:", info));
// Benchmark function
// Measurement and benchmarking logic
async function benchmarkSearches() {
    const search_strings = ["core power elite strawberry","apple", "oikos yogurt", "apple pie mcdonalds", "STEAMED DUMPLINGS CHICKEN & VEGETABLE by Bibigo", "Platinum Hydrowhey by Optimum Nutrition", "full fat oat milk by oatly", "almond milk by silk", "peanut butter", "Breakstone's Cottage Doubles Strawberry & Cottage Cheese", "Chobani® Non-Fat Greek Yogurt Strawberry", "sweet potato"];
    const searchTimes: number[] = [];
    for (const food of search_strings) {
        console.log("Searching for", food);
        const startTime = performance.now();
        const jsonInfo = await getFoodInfoJSON(food); 
        const endTime = performance.now();
        console.log("jsonInfo for", food, "is", jsonInfo);

        const searchTime = endTime - startTime;
        searchTimes.push(searchTime);
    }

    const percentiles = [0.05, 0.25, 0.50, 0.75, 0.95];
    const results = percentiles.map(p => quantileSeq(searchTimes, p, false));

    console.log("Search Times:", searchTimes);
    console.log("5, 25, 50, 75, 95th Percentiles:", results.map((r, index) => `${(percentiles[index] * 100)}th: ${(r as number).toFixed(2)}ms`));
}

benchmarkSearches();
