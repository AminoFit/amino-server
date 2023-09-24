import type { NextAuthOptions } from "next-auth"

import { prisma } from "@/database/prisma"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { Adapter } from "next-auth/adapters"
import Email from "next-auth/providers/email"
import { sendVerificationRequest } from "./EmailTemplate"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt"
  },
  providers: [
    Email({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      },
      from: process.env.EMAIL_FROM,
      sendVerificationRequest
    })
  ],
  callbacks: {
    jwt: async ({ token, user, account, profile }) => {
      if (user) {
        token.uid = user.id
      }
      return Promise.resolve(token)
    },
    session: async ({ session, user, token }) => {
      session.user = {
        ...session.user,
        userId: token.uid as string
      }

      return Promise.resolve(session)
    }
  },
  pages: {
    signIn: '/auth/signin',
    // signOut: '/auth/signout',
    // error: '/auth/error', // Error code passed in query string as ?error=
    verifyRequest: '/auth/verify-request', // (used for check email message)
    // newUser: '/auth/new-user' // New users will be directed here on first sign in (leave the property out if not of interest)
  }
}
