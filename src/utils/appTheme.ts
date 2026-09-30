// Light, dark, or the system's appearance for the signed-in pages (src/app/theme.css). The choice lives in a cookie so
// the server renders the right colours on the first paint.

export type ThemeChoice = "system" | "light" | "dark"
export const THEME_COOKIE = "amino-theme"
export const THEME_ROOT_ID = "app-theme-root"

export const themeFrom = (value: string | undefined): ThemeChoice => value === "light" || value === "dark" ? value : "system"

/** In the browser: remember the choice and apply it without a reload. */
export function applyTheme(choice: ThemeChoice) {
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  const root = document.getElementById(THEME_ROOT_ID)
  if (!root) return
  if (choice === "system") delete root.dataset.theme
  else root.dataset.theme = choice
}
