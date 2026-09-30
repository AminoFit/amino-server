"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import classNames from "classnames"
import {
  ChartBarIcon,
  ChatBubbleLeftEllipsisIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  RectangleStackIcon,
  UsersIcon
} from "@heroicons/react/24/outline"

export const NAV = [
  { href: "/admin", label: "Overview", icon: HomeIcon, exact: true },
  { href: "/admin/stats", label: "Stats", icon: ChartBarIcon },
  { href: "/admin/meals", label: "Meals", icon: ChatBubbleLeftEllipsisIcon },
  { href: "/admin/foods", label: "Foods", icon: RectangleStackIcon },
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/reports", label: "Reports", icon: ExclamationTriangleIcon }
]

/** The admin sections: a sidebar on wide screens, a scrolling tab row on narrow ones. */
export function AdminNav({ variant }: { variant: "side" | "top" }) {
  const pathname = usePathname() ?? ""
  const active = (item: (typeof NAV)[number]) => item.exact ? pathname === item.href : pathname.startsWith(item.href)
  if (variant === "top") return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
      {NAV.map(item => (
        <Link key={item.href} href={item.href} className={classNames("whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
          active(item) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(item => (
        <Link key={item.href} href={item.href} className={classNames("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
          active(item) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50")}>
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
