import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env.prod file
dotenv.config({ path: ".env.prod" });

async function callOpenRouterAPI(
  messageContent: string,
  enableStream: boolean = false,
  model: string = "mistralai/Mixtral-8x7B-Instruct-v0.1"
) {
  const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_KEY;
  const YOUR_SITE_URL = '';
  const YOUR_SITE_NAME = '';

  const headers = {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer": YOUR_SITE_URL,
    "X-Title": YOUR_SITE_NAME,
    "Content-Type": "application/json"
  };

  const body = JSON.stringify({
    model: model,
    messages: [{ "role": "user", "content": messageContent }],
    ...(enableStream && { stream: true })
  });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: headers,
      body: body
    });

    if (enableStream) {
      // Handle streaming response
      for await (const chunk of response.body) {
        // Process and output each chunk
        // Note: You'll need to parse and handle these chunks according to the OpenRouter streaming format
        process.stdout.write(chunk.toString() || '');
        const matchedJson = chunk.toString().match(/{.*}/)?.[0]; process.stdout.write(matchedJson ? JSON.parse(matchedJson)?.choices[0]?.delta?.content : '');

        process.stdout.write(JSON.parse(matchedJson!).choices[0]?.delta?.content || '');

        // process.stdout.write(JSON.parse(chunk.toString())?.choices[0]?.delta?.content || '');
        // const content = parsedLine.choices[0]?.delta?.content;

      }
    } else {
      // Handle non-streaming response
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.error("Error:", error);
    return Promise.reject(error);
  }
}

export default callOpenRouterAPI;