import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/database/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";

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
          console.log("No credentials passed in. Returning null.");
          return null;
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
            return null;
          }
          const user = await prisma.user.findUnique({
            where: {
              id: smsCode.userId,
            },
          });
          if (!user) {
            console.log("User not found");
            return null;
          }
          console.log("Found user", user);
          return user;
        }
        console.log("Code not found");
        return null;
      },
    }),
  ],
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
