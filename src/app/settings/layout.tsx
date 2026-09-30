import type { ReactNode } from "react"
import { AppShell } from "@/components/AppShell"

export const metadata = { title: "Settings · Amino", robots: { index: false, follow: false } }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
