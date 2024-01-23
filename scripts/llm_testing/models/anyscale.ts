const OPENAI_BASE_URL = "https://api.endpoints.anyscale.com/v1";
const OPENAI_API_KEY = process.env.ANYSCALE_API_KEY;

export async function* callAnyscaleApi(promptString: string, model = "mistralai/Mixtral-8x7B-Instruct-v0.1") {
    const startTime = performance.now();

    const url = `${OPENAI_BASE_URL}/chat/completions`;
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
    };
    const data = {
        model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: promptString }
        ],
        temperature: 0.1,
        stream: true,
    };

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data)
    });

    let totalTokens = 0;

    if (response.body) {
        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            let chunk = new TextDecoder("utf-8").decode(value);
            chunk = chunk.startsWith('data: ') ? chunk.substring(6) : chunk;

            const jsonStrings = chunk.split("data:").filter(Boolean);

            for (const jsonString of jsonStrings) {
                if (jsonString.trim() === "[DONE]") {
                    return; // Exit the loop and function
                }

                try {
                    const chunkData = JSON.parse(jsonString);

                    if (chunkData.choices && chunkData.choices[0].delta.tokens) {
                        totalTokens += chunkData.choices[0].delta.tokens;
                    }

                    // Check and log the usage object
                    if (chunkData.usage) {
                        const endTime = performance.now();
                        const timeTaken = (endTime - startTime) / 1000; // convert to seconds
                        const tokensPerSecond = chunkData.usage.total_tokens / timeTaken;

                        console.log("Usage data:", chunkData.usage);
                        console.log(`Total Time: ${timeTaken} seconds, Total Tokens: ${chunkData.usage.total_tokens}, Tokens/Second: ${tokensPerSecond}`);

                        return; // Exit the function after logging the usage data and TPS
                    }

                    yield chunkData;
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                }
            }
        }
    }
}


/*
  const stream = callAnyscaleApi(test_prompt, "mistralai/Mixtral-8x7B-Instruct-v0.1");

  for await (const chunk of stream) {
    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
      // Only process and output the chunk if the content property exists
      process.stdout.write(chunk.choices[0].delta.content);
    }
  }
  */