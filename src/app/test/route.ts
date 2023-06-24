import { NextResponse } from "next/server";
import { logFoodSchema, openai } from "../../utils/openai";
import { ChatCompletionRequestMessageRoleEnum } from "openai";

export async function GET() {
  const request = {
    model: "gpt-4-0613",
    messages: [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content:
          "You are a weight loss coach. You're doing a daily check-in with your client, Jack. Find out what he's had to eat today.",
      },
      {
        role: "assistant",
        content:
          "Hi Jack, hope you're doing well today. Can you please tell me what you've had to eat today?",
      },
      {
        role: "user",
        content:
          "I had a bowl of cereal for breakfast, a sandwich for lunch, and a salad for dinner.",
      },
      {
        role: "assistant",
        content:
          "That sounds like a balanced day. Could you please provide a bit more detail? For example, what kind of cereal did you have and did you add anything to it? What was in your sandwich and salad? This will help me calculate your calorie intake more accurately.",
      },
      {
        role: "user",
        content:
          "It was a regular sized bowl of frosted flakes with oat milk. Lunch was a Grilled Chicken Sandwich from Whataburger. Dinner was a Cobb Salad with Ranch Dressing. I also had a ON Hydro Whey protein shake after my workout.",
      },
    ],
    functions: [{ name: "generate_food_log_json", parameters: logFoodSchema }],
    function_call: "auto",
    temperature: 0,
  };

  const completion = await openai.createChatCompletion(request).catch((err) => {
    console.log("Error", err.message, err.response.data);
    NextResponse.json({ error: err.message });
  });
  if (!completion) {
    return;
  }

  if (completion?.data.choices[0]) {
    // console.log(completion.data.choices[0])
    const jsonString =
      completion.data.choices[0].message?.function_call?.arguments;
    if (jsonString) {
      const recipe = JSON.parse(jsonString);
      console.log(JSON.stringify(recipe, null, 2));
    } else {
      console.log("could not find json to parse");
    }
  } else {
    console.log("Data is not available");
  }

  // const completion = await openai.createChatCompletion({
  //   model: "gpt-3.5-turbo",
  //   messages: [
  //     {
  //       role: "system",
  //       content:
  //         "You are a weight loss coach. You're doing a daily check-in with your client, Jack. Find out what he's had to eat today.",
  //     },
  //     {
  //       role: "user",
  //       content: "Hi. My name is Jack. I'd like to lose weight.",
  //     },
  //   ],
  // });
  // console.log(completion.data.choices[0].message);
  return NextResponse.json({ text: completion.data.choices[0] });
}
