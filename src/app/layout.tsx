import "./globals.css";
import { QueryDataProvider } from "./providers";
import { GoogleAnalytics } from '@next/third-parties/google';
import { Inter } from "next/font/google";

// Tailwind's sans font (tailwind.config.js), self-hosted by Next.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata = {
  title: "Amino Fitness Tracker",
  description: "Track your fitness and diet with Amino",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="h-full font-sans antialiased">
        <QueryDataProvider>{children}</QueryDataProvider>
        <GoogleAnalytics gaId="AW-16524932466" />
      </body>
    </html>
  );
}