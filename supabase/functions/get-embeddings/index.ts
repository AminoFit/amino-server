import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0"

// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log("Hello from Functions!")
const pipe = await pipeline("feature-extraction", "Xenova/bge-base-en-v1.5")


Deno.serve(async (req) => {
  const { name } = await req.json()

  // Generate the embedding from the user input
  const output = await pipe(name, {
    pooling: "mean",
    normalize: true
  })

  const data = {
    message: `Hello ${output}!`
  }

  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/get-embeddings' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
