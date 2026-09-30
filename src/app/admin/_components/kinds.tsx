import type { Series } from "./Charts"
import type { MealKind } from "../_lib/types"
import { Badge } from "./ui"

// Input types always take the same colour slot, whichever ones a chart shows.
export const KIND_SERIES: (Series & { key: MealKind })[] = [
  { key: "text", label: "Text", color: "var(--series-1)" },
  { key: "photo", label: "Photo", color: "var(--series-2)" },
  { key: "photo+text", label: "Photo + text", color: "var(--series-3)" },
  { key: "voice", label: "Voice", color: "var(--series-4)" },
  { key: "barcode", label: "Barcode", color: "var(--series-5)" }
]

/** What the user sent, from the list row: photos (with or without text), voice or text. */
export function KindBadge({ photos, isAudio, content, route }: { photos: number; isAudio: boolean | null; content: string
  route?: string | null }) {
  const kind = route === "barcode" ? "barcode" : photos ? (content.trim() ? "photo+text" : "photo") : isAudio ? "voice" : "text"
  const series = KIND_SERIES.find(s => s.key === kind)!
  return (
    <Badge>
      <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: series.color }} />
      {series.label}{photos > 1 ? ` ×${photos}` : ""}
    </Badge>
  )
}
