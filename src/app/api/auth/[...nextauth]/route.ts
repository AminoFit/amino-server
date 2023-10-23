import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/database/prisma"

const ALLOWED_CALLBACK_URLS = [
  "https://yourwebsite.com/after-signin",
  "https://yourwebsite.com/other-allowed-url"
  // ... other URLs
]

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // GithubProvider({
    //   clientId: process.env.GITHUB_ID as string,
    //   clientSecret: process.env.GITHUB_SECRET as string
    // }),
    //   EmailProvider({
    //     server: {
    //       host: process.env.EMAIL_SERVER_HOST,
    //       port: process.env.EMAIL_SERVER_PORT,
    //       auth: {
    //         user: process.env.EMAIL_SERVER_USER,
    //         pass: process.env.EMAIL_SERVER_PASSWORD
    //       }
    //     },
    //     from: process.env.EMAIL_FROM
    //   })
    // ],
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ""
    }),
    CredentialsProvider({
      // The name to display on the sign in form (e.g. 'Sign in with...')
      name: "Credentials",
      // The credentials is used to generate a suitable form on the sign in page.
      // You can specify whatever fields you are expecting to be submitted.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
      credentials: {
        email: { label: "Email", type: "text", placeholder: "jsmith@gmail.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        // You need to provide your own logic here that takes the credentials
        // submitted and returns either a object representing a user or value
        // that is false/null if the credentials are invalid.
        // e.g. return { id: 1, name: 'J Smith', email: 'jsmith@example.com' }
        // You can also use the `req` object to obtain additional parameters
        // (i.e., the request IP address)

        console.log("credentials", credentials)

        const user = await prisma.user
          .findFirst({
            where: {
              email: credentials?.email.toLowerCase()
            }
          })
          .catch((err) => {
            console.log("err", err)
          })

        console.log("Returning User:", user)
        if (user) {
          return user
        }
        return null

        // // const res = await fetch('/your/endpoint', {
        // //   method: 'POST',
        // //   body: JSON.stringify(credentials),
        // //   headers: { 'Content-Type': 'application/json' }
        // // });
        // // const user = await res.json();

        // // If no error and we have user data, return it
        // if (res.ok && user) {
        //   return user;
        // }
        // // Return null if user data could not be retrieved
        // return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }: any) {
      // This is only called on login. We set the token the user will store client side and pass back to the server on future requests.
      console.log("jwt callback")
      console.log("jwt token", token)
      console.log("jwt account", account)
      if (account) {
        // Store the access_token from the provider in the token
        token.accessToken = account.access_token
      }
      token.foo = "bar"
      return token
    },
    async session({ session, token }: any) {
      // This is called every time we request the session
      //console.log("session callback")
      //console.log("session session", session)
      //console.log("session token", token)

      // Add the access_token from the token to the session
      session.accessToken = token.accessToken
      return session
    }
  },
  session: { strategy: "jwt" }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
