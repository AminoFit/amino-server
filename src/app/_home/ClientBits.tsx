"use client"

import { useState } from "react"
import { sendGAEvent } from "@next/third-parties/google"
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/20/solid"

// The homepage's two interactive bits: the App Store button (counted as a conversion) and copying the MCP address.

export const APP_STORE_URL = "https://apps.apple.com/us/app/amino-fitness/id6472242486"
export const MCP_URL = "https://www.amino.fit/api/mcp"

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} aria-hidden fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

export function AppStoreButton({ small = false }: { small?: boolean }) {
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
      onClick={() => sendGAEvent({ event: "conversion", value: "app_store_link_click" })}
      className={`inline-flex items-center gap-2.5 rounded-full bg-app-text font-semibold text-app-bg shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 ${small ? "px-4 py-2 text-sm" : "px-6 py-3.5 text-[15px]"}`}>
      <AppleLogo className={small ? "h-4 w-4" : "h-5 w-5"} />
      {small ? "Get the app" : "Download for iPhone"}
    </a>
  )
}

export function CopyMcpUrl() {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" title="Copy the address"
      onClick={() => void navigator.clipboard.writeText(MCP_URL).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })}
      className="group flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left transition hover:border-white/30 hover:bg-white/10">
      <code className="min-w-0 flex-1 truncate text-sm text-white">{MCP_URL}</code>
      {copied
        ? <span className="flex items-center gap-1 text-xs font-medium text-[#C4FF46]"><CheckIcon className="h-4 w-4" aria-hidden />Copied</span>
        : <ClipboardDocumentIcon className="h-4 w-4 text-white/60 transition group-hover:text-white" aria-label="Copy" />}
    </button>
  )
}
