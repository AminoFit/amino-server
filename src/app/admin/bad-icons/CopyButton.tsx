'use client'

export function CopyButton({ name }: { name: string }) {
  return (
    <a
      href="#"
      className="text-indigo-600 hover:text-indigo-900"
      onClick={() =>
        navigator.clipboard.writeText(
          `Generate a food icon of ${name}. It should be a small icon. On a white background. bold thick lines. It should be in color, but a light color pallet with no more than 3 colors. --no realistic. photo. face. gradients. detail. plate`
        )
      }
    >
      Copy Prompt
    </a>
  )
}
