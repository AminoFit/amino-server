import { openai } from "@/utils/openaiFunctionSchemas";
import { NextResponse } from "next/server";

export async function GET() {
  console.log("got a GET request");
  const response = await openai.images.generate({
    prompt: "Cartoon illustration of a Chicken Breast.",
    n: 2,
    size: "512x512",
  });
  return NextResponse.json({ text: "get ok", url: response.data });
}
