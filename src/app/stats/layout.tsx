import type { ReactNode } from "react"
import { AppShell } from "@/components/AppShell"

export const metadata = { title: "Stats · Amino", robots: { index: false, follow: false } }

export default function StatsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
