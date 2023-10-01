import { UserProvider } from "@auth0/nextjs-auth0/client"
import { Outfit } from "next/font/google"
import "./globals.css"
import { NextAuthProvider, QueryDataProvider } from "./providers"

const outfit = Outfit({ subsets: ["latin"] })

export const metadata = {
  title: "Amino Fitness Tracker",
  description: "Track your fitness and diet with Amino"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full ${outfit.className}`}>
        <UserProvider>
          <NextAuthProvider>
            <QueryDataProvider>{children}</QueryDataProvider>
          </NextAuthProvider>
        </UserProvider>
      </body>
    </html>
  )
}
