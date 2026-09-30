import type { ReactNode } from "react"
import { SignedInShell } from "@/app/dashboard/_components/SignedInShell"

export const metadata = { title: "Settings · Amino", robots: { index: false, follow: false } }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SignedInShell>{children}</SignedInShell>
}
