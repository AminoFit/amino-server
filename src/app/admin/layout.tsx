import Link from "next/link"
import type { ReactNode } from "react"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { requireAdmin } from "./_lib/auth"
import { AdminNav } from "./_components/AdminNav"
import "./admin.css"

export const metadata = { title: "Amino admin", robots: { index: false, follow: false } }
// Every admin page reads live data: no static rendering, and no Next data cache for the Supabase reads.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin()
  return (
    <div className="admin-root min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-zinc-200 bg-white px-3 py-4 dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
        <Link href="/admin" className="mb-5 flex items-center gap-2 px-2.5">
          <img src="/logos/amino.svg" alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold">Amino admin</span>
        </Link>
        <AdminNav variant="side" />
        <div className="mt-auto truncate px-2.5 text-xs text-zinc-400" title={user.id}>{user.email}</div>
      </aside>
      <div className="lg:pl-52">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Link href="/admin" className="text-sm font-semibold lg:hidden">Amino admin</Link>
            <form action="/admin/search" method="get" className="relative ml-auto w-full max-w-md lg:ml-0">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-zinc-400" aria-hidden />
              <input name="q" placeholder="Search foods, meals, users — name, ID, barcode, email" autoComplete="off"
                className="h-8 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            </form>
          </div>
          <AdminNav variant="top" />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
