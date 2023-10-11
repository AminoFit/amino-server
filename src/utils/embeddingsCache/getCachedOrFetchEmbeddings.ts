import { prisma } from "../../database/prisma"
import { HfInference } from "@huggingface/inference"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { getAdaEmbedding } from "../../openai/utils/embeddingsHelper"
import { raw } from "@prisma/client/runtime/library"
import { format } from '@scaleleap/pg-format'


const hf = new HfInference(process.env.HF_API_KEY)

function stringToNumberArray(embeddingStr?: string | null): number[] {
  if (!embeddingStr || embeddingStr === '[]' || embeddingStr === '') {
    return [];
  }

  // Remove square brackets and split by comma
  const numberStrings = embeddingStr.replace(/[\[\]]/g, '').split(',');

  // Convert each string to a number
  return numberStrings.map(Number);
}


async function getHfEmbedding(sentence: string, model: string = "baai/bge-base-en-v1.5"): Promise<number[]> {
  const response = await hf.featureExtraction({
    model: model,
    inputs: sentence
  })
  return response as number[]
}

export async function getCfEmbedding(
  inputText: string | string[],
  model: string = "@cf/baai/bge-base-en-v1.5"
): Promise<number[][]> {
  const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CLOUDFLARE_AI_API_KEY = process.env.CLOUDFLARE_AI_API_KEY

  // If inputText is a single string, convert it to an array
  const textArray = Array.isArray(inputText) ? inputText : [inputText]

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_AI_API_KEY}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({ text: textArray })
    }
  )

  if (!response.ok) {
    console.error("API Response:", await response.text())
    throw new Error(`Cloudflare AI API error: ${response.statusText}`)
  }

  const result = await response.json()

  // Adjusted response handling based on the observed format
  if (result.success && "result" in result && "data" in result.result) {
    // Whether singular or batched, the data is always nested within 'result.data'
    return result.result.data
  } else {
    throw new Error("Unexpected Cloudflare AI API response format.")
  }
}

const MODEL_COLUMN_MAP: Record<string, string> = {
  ADA: "adaEmbedding",
  BGE_BASE: "bgeBaseEmbedding",
};

export async function getCachedOrFetchEmbeddings(
  modelType: "ADA" | "BGE_BASE",
  searchItems: string[],
): Promise<{ id: number; embedding: number[]; text: string }[]> {
  const cachedEmbeddingField = MODEL_COLUMN_MAP[modelType];

  const searchTexts = searchItems.map(
    item => format(`%L`,item)
  ).join(",");


  const query = `SELECT id, "textToEmbed", "${cachedEmbeddingField}"::text as embedding
  FROM "foodEmbeddingCache" WHERE "textToEmbed" IN (${searchTexts}) AND "${cachedEmbeddingField}" IS NOT NULL`;
  let cachedEmbeddings = (await prisma.$queryRawUnsafe(query)) as { id: number; textToEmbed: string; embedding: number[] }[];

  cachedEmbeddings = cachedEmbeddings.map(item => ({
    ...item,
    embedding: stringToNumberArray(item.embedding as any) // use `as any` since your type expects number[], but it's actually a string here
  }));
  
  
  const foundTexts = new Set(cachedEmbeddings.map(ce => ce.textToEmbed));
  const missingTexts = searchItems.filter(item => !foundTexts.has(item));

  let newEmbeddings: { text: string; embedding: number[] }[] = [];

  if (missingTexts.length > 0) {
    switch (modelType) {
      case "ADA":
        const adaResponse = await getAdaEmbedding(missingTexts);
        newEmbeddings = adaResponse.data.map((item, index) => ({
          text: missingTexts[index],
          embedding: item.embedding,
        }));
        break;
      case "BGE_BASE":
        const cfEmbeddings = await getCfEmbedding(missingTexts);
        newEmbeddings = cfEmbeddings.map((embedding, index) => ({
          text: missingTexts[index],
          embedding: embedding,
        }));
        break;
      default:
        throw new Error("Invalid model type provided.");
    }

    for (let { text, embedding } of newEmbeddings) {
      const embeddingSql = vectorToSql(embedding);
      const insertQuery = `
        INSERT INTO "foodEmbeddingCache" ("textToEmbed", "${cachedEmbeddingField}")
        VALUES (${format(`%L`, text)}, '${embeddingSql}'::vector)
        ON CONFLICT ("textToEmbed")
        DO UPDATE SET "${cachedEmbeddingField}" = '${embeddingSql}'::vector
        WHERE "foodEmbeddingCache"."${cachedEmbeddingField}" IS NULL
        RETURNING id`;
      const returnedData: { id: number }[] = await prisma.$queryRaw(raw(insertQuery));
      cachedEmbeddings.push({ id: returnedData[0].id, textToEmbed: text, embedding: embedding });
    }
  }

  return searchItems.map(item => {
    const found = cachedEmbeddings.find(ce => ce.textToEmbed === item);
    return { id: found?.id ?? -1, embedding: found?.embedding as number[] ?? [], text: item };
  });
}

export async function getCachedOrFetchEmbeddingId(
  modelType: "ADA" | "BGE_BASE",
  food_name: string,
  brand_name?: string
): Promise<number> {
  const searchText = `${food_name}${brand_name ? ` - ${brand_name}` : ""}`

  const cachedEmbeddingField = modelType === "ADA" ? "adaEmbedding" : "bgeBaseEmbedding"
  const query = `SELECT id, "${cachedEmbeddingField}"::text as embedding
    FROM "foodEmbeddingCache" WHERE "textToEmbed" = ${format(`%L`,searchText)}`
  const cachedEmbedding = (await prisma.$queryRaw(raw(query))) as { id: number; embedding: number[] }[]

  if (cachedEmbedding && cachedEmbedding.length > 0 && cachedEmbedding[0].embedding) {
    console.log("Using cached embedding for", searchText)
    return cachedEmbedding[0].id
  } else {
    console.log("Generating new embedding for", searchText)
    let newEmbeddingArray: number[] | number[][]

    switch (modelType) {
      case "ADA":
        const adaEmbedding = await getAdaEmbedding([searchText])
        if (adaEmbedding.data && adaEmbedding.data.length > 0) {
          newEmbeddingArray = adaEmbedding.data[0].embedding
        } else {
          throw new Error("No embedding data found in ADA response.")
        }
        break
      case "BGE_BASE":
        newEmbeddingArray = (await getCfEmbedding(searchText))[0]
        break
      default:
        throw new Error("Invalid model type provided.")
    }

    const embeddingSql = vectorToSql(newEmbeddingArray)

    const query = `
    INSERT INTO "foodEmbeddingCache" ("textToEmbed", "${cachedEmbeddingField}")
    VALUES ('${searchText}', '${embeddingSql}'::vector)
    ON CONFLICT ("textToEmbed")
    DO UPDATE SET "${cachedEmbeddingField}" = '${embeddingSql}'::vector
    WHERE "foodEmbeddingCache"."${cachedEmbeddingField}" IS NULL
    RETURNING id`
    const returnedData: { id: number }[] = await prisma.$queryRaw(raw(query))

    return returnedData[0].id
  }
}





// internal only

const testSentences = [
  "The sky is blue.",
  "I love coding.",
  "AI is fascinating.",
  "OpenAI creates great models.",
  "TypeScript is powerful.",
  "How does this work?",
  "Performance testing is essential.",
  "The Earth revolves around the Sun.",
  "How does the universe function?",
  "Quantum physics is mysterious."
]

async function performanceTest(embeddingFunc: (input: string, model?: string) => Promise<number[] | number[][]>) {
  const times = []

  for (const sentence of testSentences) {
    const start = performance.now()
    await embeddingFunc(sentence)
    const end = performance.now()

    times.push(end - start)
  }

  const total = times.reduce((acc, curr) => acc + curr, 0)
  const mean = total / times.length
  const median = times.sort()[Math.floor(times.length / 2)]
  const variance = times.map((time) => Math.pow(time - mean, 2)).reduce((acc, curr) => acc + curr, 0) / times.length
  const stdDeviation = Math.sqrt(variance)

  return {
    mean,
    median,
    stdDeviation,
    allTimes: times
  }
}

async function runPerformanceTests() {
  console.log("Testing getHfEmbedding...")
  const hfResults = await performanceTest(getHfEmbedding)
  console.log("getHfEmbedding Results:", hfResults)

  console.log("\nTesting getCfEmbedding...")
  const cfResults = await performanceTest(getCfEmbedding)
  console.log("getCfEmbedding Results:", cfResults)
}

async function test() {
  const items = [
    'Fiber Well Sugar Free Gummies - Vitafusion',
    'Fiber Gummies - CVS',
    'Fiber Gummies - Metamucil',
    'Fiber Gummies - Nature Made',
    'Fiber Gummies - Kroger',
    'Fiber Gummies - Meijer',
    'Fiber Good Gummies - Phillips',
    'Fiber Gummies - Sundown Naturals',
    'Fiber Gummies - Nutrition Now',
    'Fiber Advance Gummies - Chromax',
    "Fiber Gummies - Nature's Bounty",
    'Mixed Berry Gummies - Fiber One'
  ]
  const attack_items = [
    "'; DROP TABLE members; --",
    "' OR '1'='1",
    "' UNION SELECT null, username, password FROM members; --",
    "'-- ",
    "' AND 1=2",
    "'; EXEC xp_cmdshell('cat /etc/passwd'); --",
    "'; SHUTDOWN; --",
    "IF 1=1 SLEEP(5)",
    "' OR 'x' LIKE '%",
    "0x3A70617373776F7264",
  ];
  
  console.log(await getCachedOrFetchEmbeddings("BGE_BASE", attack_items))
}

async function testGetCachedOrFetchEmbeddings() {
  // Test Data
  const foodItems = ["apple", "banana", "orange", "strawberry", "grape"];

  async function printResults(modelType: "ADA" | "BGE_BASE", items: string[]) {
    const results = await getCachedOrFetchEmbeddings(modelType, items);
    console.log(`Results for ${modelType} with items ${items.join(', ')}:`);
    console.log(results);
  }

  // Case: Nothing exists
  
  console.log('Testing case: Nothing exists');
  await printResults("ADA", foodItems);
  await printResults("BGE_BASE", foodItems);
  

  // Case: Only ADA but querying BGE and vice versa
  console.log('Testing case: Only ADA but querying BGE');
  await printResults("BGE_BASE", ["apple"]);

  console.log('Testing case: Only BGE but querying ADA');
  await printResults("ADA", ["banana"]);

  // Case: Some items in cache but not all
  console.log('Testing case: Some items in cache but not all (Fetching ADA for apple and banana)');
  await printResults("ADA", ["apple", "banana"]);

  console.log('Testing case: Some items in cache but not all (Fetching BGE_BASE for apple, banana and orange)');
  await printResults("BGE_BASE", ["apple", "banana", "orange"]);

  // Case: All items in cache
  console.log('Testing case: All items in cache (Fetching ADA for apple and banana)');
  await printResults("ADA", ["apple", "banana"]);

  console.log('Testing case: All items in cache (Fetching BGE_BASE for apple, banana and orange)');
  await printResults("BGE_BASE", ["apple", "banana", "orange"]);

  // Case: All items not in cache
  console.log('Testing case: All items not in cache (Fetching ADA for strawberry and grape)');
  await printResults("ADA", ["strawberry", "grape"]);

  console.log('Testing case: All items not in cache (Fetching BGE_BASE for strawberry and grape)');
  await printResults("BGE_BASE", ["strawberry", "grape"]);
  
}

// Run the tests
//testGetCachedOrFetchEmbeddings();
