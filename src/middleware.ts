import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge"
import { NextRequest, NextResponse } from "next/server"
import * as jose from "jose"

export async function middleware(req: NextRequest) {
  const token = req.headers.get("Authorization")

  if (!token) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 403 })
  }

  // Load public key from authentication provider
  const jwks = jose.createRemoteJWKSet(new URL(process.env.AUTH0_JWKS_URI!))
  try {
    // Verify the given token
    const result = await jose.jwtVerify(token.replace("Bearer ", ""), jwks)
    // console.log("Auth Result", result)

    // Check that the token is not expired
    const currentTime = Math.floor(Date.now() / 1000)
    const expirationTime = result.payload.exp || 0

    if (currentTime > expirationTime) {
      return NextResponse.json({ message: "Authentication failed: Token is expired" }, { status: 401 })
    }

    // Add the user to the request headers
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-amino-user", JSON.stringify(result.payload))
    
    console.log("Auth success. Calling next")
    const returnResponse = NextResponse.next({
      request: {
        // New request headers
        headers: requestHeaders
      }
    })

    return returnResponse
  } catch (e) {
    console.error("Authentication failed: Token could not be verified")
  }
  return NextResponse.json({ message: "Authentication failed: Token could not be verified" }, { status: 401 })
}

export const config = {
  matcher: ["/api/protected/:path*"]
}
