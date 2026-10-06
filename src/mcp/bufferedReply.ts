// The MCP SDK answers every POST as a server-sent event stream (chunked, no length). Some agents reach us through
// forward proxies that cut such streams partway (6 October: urllib clients behind an egress proxy got 200 with 0 or
// ~60% of the body while curl through the same proxy got all of it). A POST's reply is one JSON-RPC message, so it is
// read to the end here and sent as plain JSON with a Content-Length, which the spec allows and proxies pass whole.
// subscriptions/listen is a long-lived stream and is left alone.

type JsonRpcReply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: unknown }

/** The JSON-RPC replies (results and errors) in a server-sent event stream; notifications and keepalives are skipped. */
export function repliesInEventStream(text: string): JsonRpcReply[] {
  const replies: JsonRpcReply[] = []
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n")
    if (!data) continue
    try {
      const message = JSON.parse(data)
      if (message && typeof message === "object" && "id" in message && ("result" in message || "error" in message))
        replies.push(message)
    } catch {
      // A cut-off event isn't a reply.
    }
  }
  return replies
}

export function streamsUntilClosed(body: unknown) {
  const messages = Array.isArray(body) ? body : [body]
  return messages.some(message => (message as { method?: unknown } | null)?.method === "subscriptions/listen")
}

export async function bufferedReply(response: Response, { batch, label }: { batch: boolean; label: string }) {
  if (!response.body || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) return response
  const text = await response.text()
  const replies = repliesInEventStream(text)
  const headers = new Headers(response.headers)
  for (const name of ["content-type", "content-length", "transfer-encoding", "content-encoding"]) headers.delete(name)
  headers.set("content-type", "application/json")
  if (replies.length === 0) {
    console.warn("mcp_reply_missing", { label, bytes: text.length })
    const body = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "The reply was cut off. Try again." } })
    headers.set("content-length", String(Buffer.byteLength(body)))
    return new Response(body, { status: 500, headers })
  }
  const body = JSON.stringify(batch ? replies : replies[replies.length - 1])
  headers.set("content-length", String(Buffer.byteLength(body)))
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
