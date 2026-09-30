import type { ReactNode } from "react"
import { SignedInShell } from "@/app/dashboard/_components/SignedInShell"

export const metadata = { title: "Stats · Amino", robots: { index: false, follow: false } }

export default function StatsLayout({ children }: { children: ReactNode }) {
  return <SignedInShell>{children}</SignedInShell>
}
