export const runtime = "nodejs"

import { headers } from "next/headers"
import { NextResponse } from "next/server"

import jwt from "jsonwebtoken"
import { jwtVerify } from "jose"
import { getSession, withApiAuthRequired } from "@auth0/nextjs-auth0"
import { NextApiRequest, NextApiResponse } from "next"

export async function GET(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res)
  console.log("Session", session)
  // console.log("got a GET request in a-test")
  // const headersList = headers()
  // const authorization = headersList.get("authorization")

  // console.log("authorization", authorization)

  // if (!authorization || !authorization.startsWith("Bearer ")) {
  //   return Response.json({ error: "Missing or invalid Authorization header" }, { status: 403 })
  // }

  // const token = authorization.split(" ")[1]

  // const JWT_SECRET = `CLBMu585DQ4tqt41vxvCjC27QGqYPJ8EVmcSNps2zP5vNN859OF3VXY00h43a5bQ`

  // console.log("The token:", token)

  // const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET))

  // console.log("The payload:", payload)
  // // jwt.verify(token, JWT_SECRET as string, { algorithms: ["RS256"] }, (err, decoded) => {
  // //   if (err) {
  // //     console.log("jwt.verify error", err)
  // //   } else {
  // //     console.log("jwt.verify decoded", decoded)
  // //   }
  // // })

  console.log("Here")

  return Response.json({ message: "Success" })

  // jwt.verify()

  // return NextResponse.json(
  //   { now: Date.now() },
  //   {
  //     status: 200,
  //     headers: {
  //       "Cache-Control": "public, s-maxage=1",
  //       "CDN-Cache-Control": "public, s-maxage=1",
  //       "Vercel-CDN-Cache-Control": "public, s-maxage=1"
  //     }
  //   }
  // )
}
