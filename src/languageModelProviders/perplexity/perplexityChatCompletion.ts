interface PerplexityChatCompletionRequest {
  model: string
  messages: { role: string; content: string }[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  presence_penalty?: number
  frequency_penalty?: number
}

interface PerplexityChatCompletionResponse {
    id: string;
    model: string;
    created: number;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    object: string;
    choices: {
        index: number;
        finish_reason: string;
        message: any;
        delta: any;
    }[];
}

export async function perplexityChatCompletion({
  model,
  messages,
  max_tokens = undefined,
  temperature = undefined,
  top_p = undefined,
  top_k = undefined,
  stream = undefined,
  presence_penalty = undefined,
  frequency_penalty = undefined
}: PerplexityChatCompletionRequest): Promise<PerplexityChatCompletionResponse> {
  // Validate required parameters
  if (!model) {
    throw new Error("Model parameter is required.")
  }
  if (!messages || !Array.isArray(messages)) {
    throw new Error("Messages parameter is required and must be an array.")
  }

  // Ensure the PERPLEXITY_API_KEY is available
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set in environment variables.")
  }

  // Construct the request body with provided and default parameters
  const requestBody = {
    model,
    messages,
    ...(max_tokens !== undefined && { max_tokens }),
    ...(temperature !== undefined && { temperature }),
    ...(top_p !== undefined && { top_p }),
    ...(top_k !== undefined && { top_k }),
    ...(stream !== undefined && { stream }),
    ...(presence_penalty !== undefined && { presence_penalty }),
    ...(frequency_penalty !== undefined && { frequency_penalty })
  }

  // Setup fetch options including the API key in headers
  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}` // Include the API key here
    },
    body: JSON.stringify(requestBody)
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", options)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error("Request failed:", error)
    throw error
  }
}

async function testPerplexity() {
  const model = "pplx-70b-online"
  const messages = [
    { role: "system", content: "You are a useful food assistant that knows all about calories and item weights." },
    { role: "user", content: `Using all possible info output in a short structured way all info about: Shrimp Shumai by JFC.
You must include:
- calories and weight of item (g,oz,ml REQUIRED)
- macros (protein, fat, carbs)
- servings info ` }
  ]
  const result = await perplexityChatCompletion({ model, messages })
  console.log(result.choices[0].message.content)
}

// testPerplexity()