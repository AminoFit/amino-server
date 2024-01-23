export async function* callFireworksAPI(prompt: string) {
    const apiKey = process.env.FIREWORKS_AI_API_KEY;
    const startTime = performance.now(); // Record the start time
    
    const options = {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that answers using exact JSON output.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        top_p: 1,
        n: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: true,
        max_tokens: 2048,
        stop: null,
        prompt_truncate_len: 2048,
        model: 'accounts/fireworks/models/mixtral-8x7b-instruct'
      })
    };
  
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', options);
  
    if (response.body) {
      const reader = response.body.getReader();
      let partialData = '';
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
  
        const chunk = new TextDecoder('utf-8').decode(value);
        partialData += chunk;
  
        if (partialData.endsWith('\n\n')) {
          const messages = partialData.split('\n\n');
          for (const message of messages) {
            if (message.startsWith('data: ')) {
              const dataString = message.substring(6);
              if (dataString === '[DONE]') {
                return;
              }
              try {
                const data = JSON.parse(dataString);
                if (data.usage) {
                    const endTime = performance.now();
                    const timeTaken = (endTime - startTime) / 1000; // convert to seconds
                    const tokensPerSecond = data.usage.total_tokens / timeTaken;
    
                    console.log("Usage data:", data.usage);
                    console.log(`Total Time: ${timeTaken} seconds, Total Tokens: ${data.usage.total_tokens}, Tokens/Second: ${tokensPerSecond}`);
    
                    return; // Stop the generator after logging the usage data and TPS
                  }
                yield data;
              } catch (error) {
                console.error('Error parsing JSON:', error);
              }
            }
          }
          partialData = '';
        }
      }
    }
  }
  