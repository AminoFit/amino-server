# Agent access (MCP)

Agents (Claude, ChatGPT, Cursor, …) connect to `https://www.amino.fit/api/mcp` (Streamable HTTP, stateless).
Use the `www` host: `amino.fit` redirects, and a redirect can drop the Authorization header.

## Sign-in
- Supabase Auth's OAuth 2.1 server issues the tokens (dashboard: Authentication → OAuth Server, dynamic client
  registration on, authorization path `/oauth/consent`). `/.well-known/oauth-protected-resource[/api/mcp]` points
  clients at it; the issuer is read from Supabase's own metadata.
- `/oauth/consent` shows a QR code for `/oauth/approve?authorization_id=…`. On an iPhone with the App Store build that
  is a universal link (`/.well-known/apple-app-site-association`); otherwise Settings → Connected agents → Scan code.
  The app approves with its own session (`/api/protected/user/oauth/authorizations/[id]`) and the waiting page picks up
  the client's redirect from `OAuthConsentHandoff` (`/api/oauth/handoff/[id]`). Someone signed in on the web can
  approve on the page instead.
- Only tokens with a `client_id` claim are accepted at `/api/mcp`, so every connection is a grant the user can revoke
  (the app's Connected agents screen, `/api/protected/user/oauth/grants`). Revocation takes effect within a minute.

## Tools
`get_profile`, `list_meals`, `get_meals`, `get_daily_summary`, `sync_meals`, `update_goals`, `update_body_stats`
(`src/mcp/tools.ts`). Reads run as the user through the `mcp_*` SQL functions, so row-level security applies. Days
are the user's profile timezone. `sync_meals` is a change feed over `MealChange` (triggers on Message and
LoggedFoodItem); changes from the last 15 seconds are held back so a cursor never passes a commit in flight.

## Operations
- Kill switch: FeatureFlag `mcp_server` (`off`, `all`, or user ids).
- `McpRequest` logs every call (user, client, tool, ok, rows, ms), kept 60 days; 120 calls a minute per user.
- Try it: `claude mcp add --transport http amino https://www.amino.fit/api/mcp`, or the MCP Inspector.
