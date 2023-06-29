import Head from "next/head";
import "./globals.css";
import { Inter } from "next/font/google";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { MetaTags } from "./MetaTags";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Amino Fitness Tracker",
  description: "Track your fitness and diet with Amino",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <Head>
        <MetaTags />
      </Head>
      <body className={`h-full ${inter.className}`}>{children}</body>
    </html>
  );
}
