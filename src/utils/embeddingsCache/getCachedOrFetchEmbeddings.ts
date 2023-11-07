import { HfInference } from "@huggingface/inference"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { getAdaEmbedding } from "../../openai/utils/embeddingsHelper"
import { createAdminSupabase } from "../supabase/serverAdmin"

const hf = new HfInference(process.env.HF_API_KEY)

function stringToNumberArray(embeddingStr?: string | null): number[] {
  if (!embeddingStr || embeddingStr === "[]" || embeddingStr === "") {
    return []
  }

  // Remove square brackets and split by comma
  const numberStrings = embeddingStr.replace(/[\[\]]/g, "").split(",")

  // Convert each string to a number
  return numberStrings.map(Number)
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
  BGE_BASE: "bgeBaseEmbedding"
}

export async function getCachedOrFetchEmbeddings(
  modelType: "ADA" | "BGE_BASE",
  searchItems: string[]
): Promise<{ id: number; embedding: number[]; text: string }[]> {
  const debugLog: string[] = []

  const supabase = createAdminSupabase()

  try {
    const cachedEmbeddingField = MODEL_COLUMN_MAP[modelType]

    const uniqueSearchItems = [...new Set(searchItems)]
    debugLog.push("Searching for:", uniqueSearchItems.join(", "))

    let { data: cachedEmbeddings, error } = await supabase
      .from("foodEmbeddingCache")
      .select()
      .in("textToEmbed", uniqueSearchItems)
      .not(cachedEmbeddingField, "is", null)

    if (!cachedEmbeddings) cachedEmbeddings = []

    let newCachedEmbeddings = cachedEmbeddings.map((item) => {
      if (cachedEmbeddingField === "adaEmbedding") {
        return {
          ...item,
          embedding: stringToNumberArray(item.adaEmbedding)
        }
      } else {
        return {
          ...item,
          embedding: stringToNumberArray(item.bgeBaseEmbedding)
        }
      }
    })

    debugLog.push(
      `Processed cached embeddings: ${JSON.stringify(
        newCachedEmbeddings.map((ce) => ({ id: ce.id, textToEmbed: ce.textToEmbed }))
      )}`
    )

    const foundTexts = new Set(newCachedEmbeddings.map((ce) => ce.textToEmbed))
    debugLog.push(`Found texts: ${Array.from(foundTexts).join(", ")}`)

    const missingTexts = uniqueSearchItems.filter((item) => !foundTexts.has(item))
    debugLog.push(`Missing texts: ${missingTexts.join(", ")}`)

    let newEmbeddings: { text: string; embedding: number[] }[] = []

    if (missingTexts.length > 0) {
      debugLog.push("There are missing texts, fetching new embeddings...")

      switch (modelType) {
        case "ADA":
          const adaResponse = await getAdaEmbedding(missingTexts)
          newEmbeddings = adaResponse.data.map((item, index) => ({
            text: missingTexts[index],
            embedding: item.embedding
          }))
          break

        case "BGE_BASE":
          debugLog.push("Fetching embeddings for BGE_BASE...")
          const cfEmbeddings = await getCfEmbedding(missingTexts)
          debugLog.push(`Received embeddings from getCfEmbedding`)

          newEmbeddings = cfEmbeddings.map((embedding, index) => ({
            text: missingTexts[index],
            embedding: embedding
          }))
          break

        default:
          throw new Error("Invalid model type provided.")
      }

      for (let { text, embedding } of newEmbeddings) {
        const embeddingSql = vectorToSql(embedding)

        const { data: insertedEmbedding, error } = await supabase
          .from("foodEmbeddingCache")
          .upsert(
            {
              textToEmbed: text,
              [cachedEmbeddingField]: embeddingSql
            },
            { onConflict: "textToEmbed" }
          )
          .eq("textToEmbed", text)
          .select()
          .single()

        if (insertedEmbedding) {
          // console.log("Inserted to embedding at id", insertedEmbedding)
          newCachedEmbeddings.push({ ...insertedEmbedding, embedding: embedding })
        } else {
          console.log("Failed ot insert embedding", error)
        }
      }
    }
    const resultEmbeddings = searchItems.map((item) => {
      const found = newCachedEmbeddings.find((ce) => ce.textToEmbed === item)
      debugLog.push(`Mapping search item: ${item}, Found cached embedding: ${JSON.stringify(found)}`)
      return { id: found?.id ?? -1, embedding: (found?.embedding as number[]) ?? [], text: item }
    })

    return resultEmbeddings
  } catch (error) {
    // Dump the entire debug log if an error is caught
    console.error("Debug Log:\n", debugLog.join("\n"))
    throw error // re-throw the error so it's not silenced
  }
}

export async function getCachedOrFetchEmbeddingId(
  modelType: "ADA" | "BGE_BASE",
  food_name: string,
  brand_name?: string
): Promise<number | undefined> {
  const searchText = `${food_name}${brand_name ? ` - ${brand_name}` : ""}`

  const cachedEmbeddingField = modelType === "ADA" ? "adaEmbedding" : "bgeBaseEmbedding"

  const supabase = createAdminSupabase()

  const { data, error } = await supabase.from("foodEmbeddingCache").select().eq("textToEmbed", searchText)

  let cachedEmbedding: { id: number; embedding: number[]; textToEmbed: string }[]
  if (data) {
    cachedEmbedding = data.map((item) => ({
      ...item,
      embedding: stringToNumberArray(item[cachedEmbeddingField])
    }))
  } else {
    cachedEmbedding = []
  }

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

    const upsertData: {
      adaEmbedding?: string
      bgeBaseEmbedding?: string
      id?: number
      textToEmbed: string
      embedding?: string
    } = {
      textToEmbed: searchText
    }

    upsertData[cachedEmbeddingField] = embeddingSql

    const { data: insertedEmbedding, error } = await supabase
      .from("foodEmbeddingCache")
      .upsert(
        {
          textToEmbed: searchText,
          [cachedEmbeddingField]: newEmbeddingArray
        },
        { onConflict: "textToEmbed" }
      )
      .eq("textToEmbed", searchText)
      .is(cachedEmbeddingField, null)
      .select("id")
      .single()

    if (insertedEmbedding) {
      console.log("Inserted to embedding at id", insertedEmbedding)
    } else {
      console.log("Failed ot insert embedding", error)
    }
    if (insertedEmbedding) {
      return insertedEmbedding.id
    }
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
    "Fiber Well Sugar Free Gummies - Vitafusion",
    "Fiber Gummies - CVS",
    "Fiber Gummies - Metamucil",
    "Fiber Gummies - Nature Made",
    "Fiber Gummies - Kroger",
    "Fiber Gummies - Meijer",
    "Fiber Good Gummies - Phillips",
    "Fiber Gummies - Sundown Naturals",
    "Fiber Gummies - Nutrition Now",
    "Fiber Advance Gummies - Chromax",
    "Fiber Gummies - Nature's Bounty",
    "Mixed Berry Gummies - Fiber One"
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
    "0x3A70617373776F7264"
  ]

  console.log(await getCachedOrFetchEmbeddings("BGE_BASE", attack_items))
}

async function testGetCachedOrFetchEmbeddings() {
  // Test Data
  const foodItems = ["apple", "banana", "orange", "strawberry", "grape"]

  async function printResults(modelType: "ADA" | "BGE_BASE", items: string[]) {
    const results = await getCachedOrFetchEmbeddings(modelType, items)
    console.log(`Results for ${modelType} with items ${items.join(", ")}:`)
    console.log(results)
  }

  // Case: Nothing exists

  console.log("Testing case: Nothing exists")
  await printResults("ADA", foodItems)
  await printResults("BGE_BASE", foodItems)

  // Case: Only ADA but querying BGE and vice versa
  console.log("Testing case: Only ADA but querying BGE")
  await printResults("BGE_BASE", ["apple"])

  console.log("Testing case: Only BGE but querying ADA")
  await printResults("ADA", ["banana"])

  // Case: Some items in cache but not all
  console.log("Testing case: Some items in cache but not all (Fetching ADA for apple and banana)")
  await printResults("ADA", ["apple", "banana"])

  console.log("Testing case: Some items in cache but not all (Fetching BGE_BASE for apple, banana and orange)")
  await printResults("BGE_BASE", ["apple", "banana", "orange"])

  // Case: All items in cache
  console.log("Testing case: All items in cache (Fetching ADA for apple and banana)")
  await printResults("ADA", ["apple", "banana"])

  console.log("Testing case: All items in cache (Fetching BGE_BASE for apple, banana and orange)")
  await printResults("BGE_BASE", ["apple", "banana", "orange"])

  // Case: All items not in cache
  console.log("Testing case: All items not in cache (Fetching ADA for strawberry and grape)")
  await printResults("ADA", ["strawberry", "grape"])

  console.log("Testing case: All items not in cache (Fetching BGE_BASE for strawberry and grape)")
  await printResults("BGE_BASE", ["strawberry", "grape"])
}
async function testGetCachedOrFetchEmbeddingsDuplicates() {
  // Array of test inputs
  const testInputs = [
    ["car", "house", "House", "Car", "car"],
    ["bridge", "town house", "bridge"],
    ["apple", "Apple", "tree", "TREE", "apple"],
    ["dog", "Dog", "cat", "CAT", "dog"],
    ["book", "pen", "Pen", "BOOK", "book"],
    ["river", "mountain", "Mountain", "RIVER", "river"],
    ["phone", "Phone", "tablet", "TABLET", "phone"],
    ["chair", "table", "Table", "CHAIR", "chair"],
    ["ocean", "beach", "Beach", "OCEAN", "ocean"],
    ["flower", "rose", "Rose", "FLOWER", "flower"],
    ["city", "country", "Country", "CITY", "city"],
    ["road", "path", "Path", "ROAD", "road"],
    ["coffee", "mug", "MUG", "Coffee", "COFFEE"],
    ["star", "planet", "Star", "PLANET", "star"],
    ["shoe", "Shoe", "sock", "SOCK", "sock"],
    ["pencil", "paper", "Paper", "PENCIL", "pencil"],
    ["window", "door", "Door", "WINDOW", "window"],
    ["sugar", "salt", "Sugar", "SALT", "salt"],
    ["shirt", "Shirt", "hat", "HAT", "hat"],
    ["gold", "silver", "Gold", "SILVER", "silver"],
    ["piano", "guitar", "Guitar", "PIANO", "piano"],
    ["plate", "bowl", "Bowl", "PLATE", "plate"]
  ]

  for (let i = 0; i < testInputs.length; i++) {
    console.log(`Testing input set ${i + 1}:`, testInputs[i])
    const results = await getCachedOrFetchEmbeddings("BGE_BASE", testInputs[i])

    // Assertion 1: Check if the length of results matches the input
    if (results.length !== testInputs[i].length) {
      console.error(`Test set ${i + 1} failed: Expected ${testInputs[i].length} results but got ${results.length}`)
    }

    // Assertion 2: Check if duplicate inputs have the same id
    const idMap = new Map()
    for (let j = 0; j < testInputs[i].length; j++) {
      if (idMap.has(testInputs[i][j])) {
        if (idMap.get(testInputs[i][j]) !== results[j].id) {
          console.error(`Test set ${i + 1} failed: Duplicate inputs "${testInputs[i][j]}" have different ids.`)
        }
      } else {
        idMap.set(testInputs[i][j], results[j].id)
      }
    }
  }
}

// Run the test function
// testGetCachedOrFetchEmbeddingsDuplicates()

// Run the tests
// testGetCachedOrFetchEmbeddings()
