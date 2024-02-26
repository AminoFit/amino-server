"use client"

import { useState } from "react"
import CopyToClipboard from "react-copy-to-clipboard"

export function CopyButton({ name }: { name: string }) {
  const [status, setStatus] = useState("Copy Prompt")
  return (
    <CopyToClipboard
      text={`Generate a food icon of ${name}. It should be a small icon. On a white background. bold thick lines. It should be in color, but a light color pallet with no more than 3 colors. --no realistic. photo. face. gradients. detail. plate`}
      onCopy={() => setStatus("Copied!")}
    >
      <a href="#" className="text-indigo-600 hover:text-indigo-900">
        {status}
      </a>
    </CopyToClipboard>
  )
}
