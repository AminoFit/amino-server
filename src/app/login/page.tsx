import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { AppShell } from "@/components/AppShell"
import { AminoLogo } from "@/components/AminoLogo"
import { safeNextPath } from "./nextPath"
import { PasswordSignIn, PhoneSignIn } from "./SignInForms"

// Signing in on the web: scan a code with the app (for people who sign in with Apple on the phone), or email and
// password, or Google. Accounts are made in the app.
export const dynamic = "force-dynamic"
export const metadata = { title: "Sign in · Amino" }

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string; session?: string } }) {
  const next = safeNextPath(searchParams.next)
  const { data } = await createClient().auth.getUser()
  if (data?.user && searchParams.session !== "expired") redirect(next ?? "/log")

  return (
    <AppShell>
      <div className="flex min-h-screen flex-col">
        <header className="mx-auto w-full max-w-5xl px-6 py-5">
          <a href="/" className="inline-block"><AminoLogo className="h-7 w-auto" /></a>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-4xl">
            <div className="app-rise text-center">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sign in to Amino</h1>
              <p className="mt-2 text-app-muted">Your food log, goals and connected agents, on the big screen.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <section className="app-rise rounded-3xl border border-app-border/70 bg-app-card p-6 shadow-sm shadow-black/[0.03] sm:p-8"
                style={{ "--delay": "80ms" } as React.CSSProperties}>
                <PhoneSignIn next={next} />
              </section>
              <section className="app-rise rounded-3xl border border-app-border/70 bg-app-card p-6 shadow-sm shadow-black/[0.03] sm:p-8"
                style={{ "--delay": "140ms" } as React.CSSProperties}>
                <PasswordSignIn next={next} googleFailed={searchParams.error === "google"} />
              </section>
            </div>
            <p className="app-rise mt-8 text-center text-sm text-app-muted" style={{ "--delay": "200ms" } as React.CSSProperties}>
              New to Amino? <a href="https://apps.apple.com/us/app/amino-fitness/id6472242486" className="font-medium text-app-link hover:underline">Get the app</a>
            </p>
          </div>
        </main>
      </div>
    </AppShell>
  )
}
