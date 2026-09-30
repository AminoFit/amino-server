"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react"
import {
  ArrowRightStartOnRectangleIcon, BookOpenIcon, ChartBarIcon, ComputerDesktopIcon, Cog6ToothIcon, MoonIcon, SunIcon
} from "@heroicons/react/20/solid"
import { AminoLogo } from "@/components/AminoLogo"
import { applyTheme, type ThemeChoice } from "@/utils/appTheme"
import { logout } from "@/app/login/actions"
import { initials } from "../_lib/stats"

const THEMES: { choice: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { choice: "system", label: "System", Icon: ComputerDesktopIcon },
  { choice: "light", label: "Light", Icon: SunIcon },
  { choice: "dark", label: "Dark", Icon: MoonIcon }
]

const TABS = [
  { key: "log", label: "Log", href: "/log", Icon: BookOpenIcon },
  { key: "stats", label: "Stats", href: "/stats", Icon: ChartBarIcon },
  { key: "settings", label: "Settings", href: "/settings", Icon: Cog6ToothIcon }
] as const

/** System, light or dark, with labels (the Settings page). */
export function ThemeSwitch({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState(initial)
  return (
    <div className="inline-flex rounded-full bg-app-text/[0.06] p-1" role="radiogroup" aria-label="Appearance">
      {THEMES.map(({ choice: option, label, Icon }) => (
        <button key={option} type="button" role="radio" aria-checked={choice === option}
          onClick={() => { setChoice(option); applyTheme(option) }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${choice === option
            ? "bg-app-card text-app-text shadow-sm" : "text-app-muted hover:text-app-text"}`}>
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  )
}

/** The signed-in pages' bar. Tabs are client-side links, prefetched, so switching doesn't reload the page. */
export function TopBar({ name, email }: { name?: string; email?: string }) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 border-b border-app-border/40 bg-app-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/log" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link">
          <AminoLogo className="h-7 w-auto" />
        </Link>
        <nav className="ml-2 flex items-center gap-1 sm:ml-6" aria-label="Sections">
          {TABS.map(({ key, label, href, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
            <Link key={key} href={href} prefetch aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${active
                ? "bg-app-text/10 text-app-text" : "text-app-muted hover:bg-app-text/[0.05] hover:text-app-text"}`}>
              <Icon className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Menu as="div" className="relative">
            <MenuButton className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-app-primary to-app-accent text-xs font-semibold text-white ring-2 ring-app-card transition hover:scale-105 focus-visible:outline-none focus-visible:ring-app-link">
              {initials(name, email)}
            </MenuButton>
            <MenuItems
              className="app-fade absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-app-border/70 bg-app-card p-1.5 text-app-text shadow-xl shadow-black/10 focus:outline-none">
              <div className="px-3 py-2.5">
                {name && <p className="truncate text-sm font-semibold">{name}</p>}
                {email && <p className="truncate text-xs text-app-muted">{email}</p>}
              </div>
              <div className="my-1 h-px bg-app-border/60" />
              <MenuItem>
                <Link href="/settings" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm data-[focus]:bg-app-text/[0.06]">
                  <Cog6ToothIcon className="h-4 w-4 text-app-muted" aria-hidden /> Settings
                </Link>
              </MenuItem>
              <MenuItem>
                <button type="submit" form="logout-form"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm data-[focus]:bg-app-text/[0.06]">
                  <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-app-muted" aria-hidden /> Log out
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
          <form id="logout-form" action={logout} hidden />
        </div>
      </div>
    </header>
  )
}
