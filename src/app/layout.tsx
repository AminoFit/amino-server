import "./globals.css"
import { QueryDataProvider } from "./providers"

// const outfit = Outfit({ subsets: ["latin"] })

export const metadata = {
  title: "Amino Fitness Tracker",
  description: "Track your fitness and diet with Amino"
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full`}>
        <QueryDataProvider>{children}</QueryDataProvider>
      </body>
    </html>
  )
}
