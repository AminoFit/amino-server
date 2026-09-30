import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { THEME_COOKIE, THEME_ROOT_ID, themeFrom } from "@/utils/appTheme"
import "@/app/theme.css"

/** The signed-in pages' background and colours, in the theme the user picked (or the system's). */
export function AppShell({ children }: { children: ReactNode }) {
  const theme = themeFrom(cookies().get(THEME_COOKIE)?.value)
  return (
    <div id={THEME_ROOT_ID} data-theme={theme === "system" ? undefined : theme}
      className="app-theme app-glow min-h-full bg-app-bg text-app-text">
      {children}
    </div>
  )
}
