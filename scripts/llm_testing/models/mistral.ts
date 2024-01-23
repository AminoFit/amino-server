import axios from 'axios';

// Define types for the request body
type MistralMessage = {
    role: 'user' | 'system';
    content: string;
};

type MistralRequestBody = {
    model: string;
    messages: MistralMessage[];
};
export async function* callMistralApi(promptString: string, model: string = "mistral-small") {
    // Construct the request URL and headers
    const url = 'https://api.mistral.ai/v1/chat/completions';
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new Error('Mistral API key is not set in the environment variables');
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    // Construct the request body
    const data = {
        model,
        messages: [{ role: 'user', content: promptString }],
        stream: true, // Enable streaming
    };

    // Make the API call using Fetch API
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });

    if (response.body) {
        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            let chunk = new TextDecoder('utf-8').decode(value);
            chunk = chunk.startsWith('data: ') ? chunk.substring(6) : chunk;

            const jsonStrings = chunk.split('data:').filter(Boolean);

            for (const jsonString of jsonStrings) {
                if (jsonString.trim() === '[DONE]') {
                    return; // Exit the loop and function
                }

                try {
                    const chunkData = JSON.parse(jsonString);
                    yield chunkData;
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }
            }
        }
    }
}