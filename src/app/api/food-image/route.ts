import { openai } from "@/utils/openai";
import { NextResponse } from "next/server";

export async function GET() {
  console.log("got a GET request");
  const response = await openai.createImage({
    prompt: "Cartoon illustration of a Chicken Breast.",
    n: 2,
    size: "512x512",
  });
  return NextResponse.json({ text: "get ok", url: response.data });
}
