import type { ReactNode } from "react"
import { AppShell } from "@/components/AppShell"

export const metadata = { title: "Your log · Amino", robots: { index: false, follow: false } }

export default function LogLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
