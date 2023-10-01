import { withApiAuthRequired } from "@auth0/nextjs-auth0"
import { NextRequest, NextResponse } from "next/server"
import * as jose from "jose"

// const GET = async (req: NextRequest) => {
//   const token = req.headers.get("Authorization")

//   console.log("Found a token:", token)
//   if (!token) {
//     return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 403 })
//   }
//   return await authenticateRequest(token)
// }

// async function authenticateRequest(token: string) {
//   // Load public key from authentication provider
//   const jwks = jose.createRemoteJWKSet(new URL(process.env.AUTH0_JWKS_URI!))
//   try {
//     // Verify the given token
//     const result = await jose.jwtVerify(token.replace("Bearer ", ""), jwks)
//     console.log("result", result)
//     return NextResponse.json({ message: "Success" }, { status: 200 })
//   } catch (e) {
//     console.error("Authentication failed: Token could not be verified")
//     return new NextResponse(
//       JSON.stringify({ success: false, message: "Authentication failed: Token could not be verified" }),
//       { status: 401, headers: { "content-type": "application/json" } }
//     )
//   }
// }

const GET = async (req: NextRequest) => {
  const message = {
    text: "This is a protected message.",
    user: req.headers.get("x-amino-user")
  }
  console.log("got a GET request in protected")
  console.log("Message:", message)
  return NextResponse.json(message)
}

export { GET }
