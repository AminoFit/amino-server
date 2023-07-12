import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/database/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";

// interface ExtendedUser extends User {
//   id: string;
//   roles: string[];
// }

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter<boolean>,

  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "SMS Code",
      credentials: {
        // email: {
        //   label: "Email",
        //   type: "email",
        //   placeholder: "example@example.com",
        // },
        code: {
          label: "Code",
          type: "string",
          placeholder: "123ABC",
        },
        // password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("Running authorize() credentials", credentials);

        if (!credentials || !credentials.code) {
          console.log("No code provided");
          throw new Error("No code provided");
        }

        const smsCode = await prisma.smsAuthCode.findUnique({
          where: {
            code: credentials.code,
          },
        });

        if (smsCode) {
          console.log("Found smsCode", smsCode);
          if (smsCode.expiresAt < new Date()) {
            console.log("Code expired");
            throw new Error("Code is expired. Please request a new one.");
          }
          const user = await prisma.user.findUnique({
            where: {
              id: smsCode.userId,
            },
          });
          if (!user) {
            console.log("User not found");
            throw new Error("User not found.");
          }
          console.log("Found user", user);
          return user;
        }
        console.log("Code not found");
        throw new Error("Invalid code. Please request a new one.");
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, account, profile }) => {
      if (user) {
        token.uid = user.id;
      }
      return Promise.resolve(token);
    },
    session: async ({ session, user, token }) => {
      session.user = {
        ...session.user,
        userId: token.uid as string,
      };

      return Promise.resolve(session);
    },
  },
};

// CredentialsProvider({
//   async authorize(credentials) {
//     const authResponse = await fetch("/users/login", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(credentials),
//     })

//     if (!authResponse.ok) {
//       return null
//     }

//     const user = await authResponse.json()

//     return user
//   },
// }),
