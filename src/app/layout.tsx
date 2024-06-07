import { brockmann } from "@/fonts/fonts"
import "./globals.css"
import { QueryDataProvider } from "./providers"
import { GoogleAnalytics } from "@next/third-parties/google"



export const metadata = {
  title: "Amino Fitness Tracker",
  description: "Track your fitness and diet with Amino"
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={"h-full " + brockmann.className}>
      <body className={`h-full`}>
        <QueryDataProvider>{children}</QueryDataProvider>
        <GoogleAnalytics gaId="AW-16524932466" />
      </body>
    </html>
  )
}
