import { AppShell } from "@/components/AppShell"
import { AminoLogo } from "@/components/AminoLogo"
import { isSignInId } from "@/utils/webSignIn"

// The sign-in QR code's link. With Amino installed on the iPhone it opens the app (a universal link) and never reaches
// this page; otherwise it lands here.
export const metadata = { title: "Approve in Amino" }

export default function ApproveSignInPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = isSignInId(searchParams.id) ? searchParams.id : null
  return (
    <AppShell>
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="app-rise w-full max-w-sm rounded-3xl border border-app-border/70 bg-app-card p-8 text-center shadow-sm">
          <AminoLogo className="mx-auto h-8 w-auto" />
          <h1 className="mt-6 text-xl font-semibold tracking-tight">Open this in the Amino app</h1>
          <p className="mt-2 text-sm text-app-muted">Signing in on the web is approved in Amino on your iPhone.</p>
          {id ? <a href={`fit.amino://signin/approve?id=${id}`}
            className="mt-6 flex w-full justify-center rounded-xl bg-app-text px-4 py-2.5 text-sm font-semibold text-app-bg">Open Amino</a>
            : <p className="mt-6 text-sm text-app-muted">This link isn&apos;t complete. Get a new code on the sign-in page.</p>}
        </div>
      </main>
    </AppShell>
  )
}
