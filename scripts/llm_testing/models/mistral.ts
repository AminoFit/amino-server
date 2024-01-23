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

// Define the function
export async function callMistralApi(promptString: string, model: string = "mistral-small"): Promise<any> {
    // Construct the request body
    const requestBody: MistralRequestBody = {
        model: model,
        messages: [{ role: 'user', content: promptString }]
    };

    // Get the API key from the environment variables
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new Error('Mistral API key is not set in the environment variables');
    }

    // Set up the headers
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        // Make the API call
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', requestBody, { headers });
        return response.data;
    } catch (error) {
        // Handle any errors
        console.error('Error calling Mistral API:', error);
        throw error;
    }
}
