import { NextRequest, NextResponse } from "next/server"
import { GetAppSessionOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { userDatabase } from "@/mcp/auth"
import { daysCsv, exportFileName, foodsCsv, type ExportKind } from "@/export/export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** GET ?kind=foods|days: the signed-in user's logged foods or daily totals as a CSV file (src/export/export.ts). */
export async function GET(request: NextRequest) {
  const { token, error } = await GetAppSessionOnRequest()
  if (!token) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 })
  const kind = request.nextUrl.searchParams.get("kind") as ExportKind | null
  if (kind !== "foods" && kind !== "days") return NextResponse.json({ error: "invalid_kind" }, { status: 422 })
  // Tomorrow in UTC covers today in every timezone.
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  try {
    const db = userDatabase(token)
    const csv = kind === "foods" ? await foodsCsv(db, to) : await daysCsv(db, to)
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${exportFileName(kind, new Date().toISOString().slice(0, 10))}"` } })
  } catch (failure) {
    console.error("export_failed", { kind, error: failure instanceof Error ? failure.message : failure })
    return NextResponse.json({ error: "export_unavailable" }, { status: 500 })
  }
}
