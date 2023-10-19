import OpenAI from "openai"
import { User } from "@prisma/client"
import { LogOpenAiUsage } from "../utils/openAiHelper"
import { ChatCompletionCreateParamsStreaming } from "openai/resources/chat"
import * as math from 'mathjs';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ChatCompletionOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  functions?: any[] // You should replace 'any' with the appropriate type.
  function_call?: string
  prompt?: string
  stop?: string
}

export async function chatCompletion(
  {
    messages,
    functions,
    model = "gpt-3.5-turbo-0613",
    temperature = 0.5,
    max_tokens = 2048,
    function_call = "auto",
    ...options
  }: ChatCompletionOptions,
  user: User
) {
  try {
    const result = await openai.chat.completions.create({
      model,
      messages,
      max_tokens,
      temperature,
      functions
    })

    if (!result.choices[0].message) {
      throw new Error("No return error from chat")
    }
    
    if (result.usage) {
      // log usage
      await LogOpenAiUsage(user, result.usage, model)
    }

    return result.choices[0].message
  } catch (error) {
    console.log(error)
    throw error
  }
}


export interface ChatCompletionInstructOptions {
  model?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string;
  [key: string]: any;  // for other potential parameters
}

function removeTrailingCommas(str: string) {
  let correctedResponse = str;
  let previousString = "";
  while (correctedResponse !== previousString) {
      previousString = correctedResponse;
      correctedResponse = correctedResponse.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
  }
  return correctedResponse;
}
function correctMathExpressions(text: string): string {
  // Match mathematical expressions that end with a comma (after optional spaces)
  // Ensuring either enclosed by two quotation marks or without quotation marks.
  const mathExpressionPattern = /:\s*(?:(["])([\d\s\.\+\-\*\/]+)\1|([\d\s\.\+\-\*\/]+))\s*,/g;

  return text.replace(mathExpressionPattern, (match, quote1, expressionWithQuote, expressionWithoutQuote) => {
      const expression = expressionWithQuote || expressionWithoutQuote;

      try {
          const evaluatedValue = math.evaluate(expression);
          return `: ${evaluatedValue},`;
      } catch (e) {
          // If mathjs fails to evaluate, return the original expression.
          return match;
      }
  });
}


export function correctAndParseResponse(responseText: string): any {
  try {
      // Recursive removal of trailing commas until none are left
      let correctedResponse = removeTrailingCommas(responseText);

      // Replace keys without quotes to be with quotes
      correctedResponse = correctedResponse.replace(/(?<!["'])\b(\w+)\b(?!["']):/g, '"$1":');

      // Convert 'False' to 'false' and 'True' to 'true'
      correctedResponse = correctedResponse.replace(/\bFalse\b/g, 'false').replace(/\bTrue\b/g, 'true');

      // Replace fractions with their decimal representation
      correctedResponse = replaceFractionsWithDecimals(correctedResponse);

      // fix math expressions
      correctedResponse = correctMathExpressions(correctedResponse);

      // Ensure there's a comma at the end of a line if the next line is not a closing bracket
      correctedResponse = ensureCommaAtEndOfLine(correctedResponse);

      return JSON.parse(correctedResponse);
  } catch (error) {
      console.error("Failed to correct and parse the response:", responseText, error);
      return null;
  }
}

function replaceFractionsWithDecimals(text: string): string {
  // Match the fraction pattern and possible guessed decimal value
  const fractionPattern = /(\b\d+)\s*\/\s*(\d+\b)(?:\s*=\s*([\d.]+))?/g;

  return text.replace(fractionPattern, (match, numerator, denominator) => {
      const decimalValue = (Number(numerator) / Number(denominator)).toFixed(2);  // Truncate to 3 significant figures
      return decimalValue.toString();
  });
}


function ensureCommaAtEndOfLine(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      const nextLine = lines[i + 1].trim();
      if (line && !line.endsWith(',') && !nextLine.startsWith('}') && !nextLine.startsWith(']') && !line.endsWith('{') && !line.endsWith('[')) {
          lines[i] = line + ',';
      }
  }
  return lines.join('\n');
}





export async function chatCompletionInstruct(
  {
    model = "gpt-3.5-turbo-instruct",
    prompt,
    temperature = 0.5,
    max_tokens = 2048,
    stop,
    ...options
  }: ChatCompletionInstructOptions,
  user: User
) {
  try {
    const result = await openai.completions.create({
      model,
      prompt,
      temperature,
      max_tokens,
      stop,
      ...options  // pass other options if any
    })

    if (!result.choices || result.choices.length === 0 || !result.choices[0].text) {
      throw new Error("No return data from instruction completion")
    }
    
    if (result.usage) {
      // log usage
      await LogOpenAiUsage(user, result.usage, model)
    }

    return result.choices[0];
  } catch (error) {
    console.log(error);
    throw error;
  }
}


export async function* chatCompletionInstructStream(
  {
    model = "gpt-3.5-turbo-instruct",
    prompt,
    temperature = 0.5,
    max_tokens = 2048,
    stop,
    ...options
  }: ChatCompletionInstructOptions,
  user: User
): AsyncIterable<string> {
  try {
    const stream = await openai.completions.create({
      model,
      prompt,
      temperature,
      max_tokens,
      stop,
      stream: true,
      ...options
    });

    let accumulatedContent = "";

    for await (const chunk of stream) {
        accumulatedContent += chunk.choices[0].text;
    
        while (true) {
            let startPos = accumulatedContent.indexOf('{');
            if (startPos === -1) {
                break;  // If we can't find a start brace, break and wait for more chunks
            }
            
            let balance = 0;
            let endPos = -1;
            for (let i = startPos; i < accumulatedContent.length; i++) {
                if (accumulatedContent[i] === '{') {
                    balance++;
                } else if (accumulatedContent[i] === '}') {
                    balance--;
                }
    
                if (balance === 0) {
                    endPos = i;
                    break;
                }
            }
    
            if (endPos === -1) {
                break;  // If we can't find a balanced closing brace, break and wait for more chunks
            }
    
            const potentialJsObject = accumulatedContent.substring(startPos, endPos + 1);
            const correctedJson = correctAndParseResponse(potentialJsObject);
            if (correctedJson) {
                yield correctedJson;
            }
            accumulatedContent = accumulatedContent.substring(endPos + 1);
        }
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function* chatCompletionFunctionStream({
  model = "gpt-3.5-turbo-0613",
  messages,
  temperature = 0.5,
  max_tokens = 2048,
  stop,
  functions,
  function_call = "auto",
  ...options
}: ChatCompletionOptions, user: User): AsyncIterable<string> {
  
  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: messages,
      temperature,
      max_tokens,
      functions,
      function_call,
      stream: true,
    } as ChatCompletionCreateParamsStreaming);

    for await (const chunk of stream) {
      
      // Check if 'content' exists and yield it
      if (chunk?.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content;
      } 
      // If 'content' doesn't exist, check for 'function_call.arguments' and yield that
      else if (chunk?.choices[0]?.delta?.function_call?.arguments) {
        yield chunk.choices[0].delta.function_call.arguments;
      }
    }    

  } catch (error) {
    console.error(error);
    throw error;
  }
}

